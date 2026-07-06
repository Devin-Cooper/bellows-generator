// tests/rib-master-rotation.test.js
// Task 4 — rib-lattice split-axis choice + rotated-block render.
// Each wall picks the orientation whose un-splittable rib WIDTH fits the cross bed dimension, then
// the FEWEST stack segments (tie -> un-rotated). Rotated blocks render in BLOCK-LOCAL coords, seated
// by a per-block `translate(block.x + orientedW, block.y) rotate(90)` INSIDE each layer group; the
// calibration square + sheet-level text stay upright, per-rib labels rotate WITH their block.
import { describe, it, expect } from 'vitest';
import { renderRibMasterSheets, packRibSheets, collectWalls } from '../src/render/svg.js';
import { normalizeParams, DEFAULT_PARAMS } from '../src/params.js';

const P = (o = {}) => normalizeParams({ ...DEFAULT_PARAMS, ...o });
const blocksOf = (params) => packRibSheets(collectWalls(params), params).flatMap((s) => s.blocks);
const sheetsOf = (params) => renderRibMasterSheets({}, params); // model is unused by the renderer
const sheetDim = (svg) => ({
  w: Number(svg.match(/width="([\d.]+)mm"/)[1]),
  h: Number(svg.match(/height="([\d.]+)mm"/)[1]),
});
function bboxOfD(d) {
  const nums = d.replace(/[MLZ]/g, ' ').trim().match(/-?[\d.]+/g).map(Number);
  const xs = [], ys = [];
  for (let i = 0; i < nums.length; i += 2) { xs.push(nums[i]); ys.push(nums[i + 1]); }
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}
// SCREEN bbox of every rotated ladder path. A rotated block is
//   <g transform="translate(X, Y) rotate(90)"> ... <path data-role="ladder" d="D"/> ... </g>
// SVG rotate(90) maps local (x,y) -> (-y,x); with the translate: screenX = X - y, screenY = Y + x.
function rotatedLadderBoxes(svg) {
  const boxes = [];
  const gre = /<g transform="translate\(([-\d.]+),\s*([-\d.]+)\)\s+rotate\(90\)">(.*?)<\/g>/gs;
  let m;
  while ((m = gre.exec(svg)) !== null) {
    const pm = /data-role="ladder"[^>]*\bd="([^"]+)"/.exec(m[3]);
    if (!pm) continue;
    const X = Number(m[1]), Y = Number(m[2]);
    const b = bboxOfD(pm[1]);
    boxes.push({ minX: X - b.maxY, maxX: X - b.minY, minY: Y + b.minX, maxY: Y + b.maxX });
  }
  return boxes;
}
const stripRotate = (svg) =>
  svg.replace(/<g transform="translate\([^)]*\)\s+rotate\(90\)">.*?<\/g>/gs, '');

describe('packRibSheets — split-axis orientation choice', () => {
  it('packs each default wall WHOLE and rotated: 4 blocks, one per wall, no Y-split (was 8)', () => {
    const blocks = blocksOf(P());
    expect(blocks.length).toBe(4);
    const byWall = new Map();
    for (const b of blocks) {
      const k = `${b.face}${b.wallIndex}`;
      byWall.set(k, (byWall.get(k) || 0) + 1);
    }
    expect([...byWall.keys()].sort()).toEqual(['H1', 'H3', 'W0', 'W2']);
    expect([...byWall.values()].every((n) => n === 1)).toBe(true);
    expect(blocks.every((b) => b.rotated === true)).toBe(true);
    expect(blocks.every((b) => b.segIndex === 0)).toBe(true);
  });

  it('a rotated block swaps its footprint: oriented width = stack length, height = rib-width band', () => {
    const params = P();
    const b = blocksOf(params).find((x) => x.face === 'W' && x.wallIndex === 0);
    expect(b.rotated).toBe(true);
    expect(b.contentW).toBeGreaterThan(b.contentH);
    const pitch = params.rib + params.gap;
    expect(b.contentW).toBeCloseTo(params.kerf + (b.ribs.length - 1) * pitch + params.rib, 4);
    expect(b.contentH).toBeCloseTo(params.kerf + b.leftPad + b.widthMax + b.rightPad, 4);
  });

  it('never trades a fitting cross-dim for fewer segments: a wide wall stays un-rotated', () => {
    // frontW 420 -> W-wall rib width ~390mm: FITS usableW (599.6) un-rotated (2 segments), but
    // OVERFLOWS usableH (341.4) if rotated (which would be a single segment). Fit-first must win.
    const blocks = blocksOf(P({ frontW: 420 }));
    const wBlocks = blocks.filter((b) => b.face === 'W');
    const hBlocks = blocks.filter((b) => b.face === 'H');
    expect(wBlocks.length).toBeGreaterThan(0);
    expect(wBlocks.every((b) => b.rotated === false)).toBe(true);
    const wSegs = new Map();
    for (const b of wBlocks) {
      const k = `${b.face}${b.wallIndex}`;
      wSegs.set(k, (wSegs.get(k) || 0) + 1);
    }
    expect([...wSegs.values()].some((n) => n >= 2)).toBe(true); // rotating WOULD have been fewer
    expect(hBlocks.every((b) => b.rotated === true)).toBe(true); // narrow H walls DO rotate whole
  });

  it('leaves a small wall that already fits the bed height un-rotated (no needless rotation)', () => {
    const params = P({ maxDraw: 100 }); // short stack (<usableH) fits whole un-rotated
    const blocks = blocksOf(params);
    expect(blocks.length).toBe(4);
    expect(blocks.every((b) => b.rotated === false)).toBe(true);
    expect(blocks.every((b) => b.segIndex === 0)).toBe(true);
    for (const svg of sheetsOf(params)) expect(svg).not.toContain('rotate(90)');
  });
});

describe('renderRibSheetSVG — rotated block transform seats geometry on-bed', () => {
  it('renders every default rib lattice inside [0,bedW]x[0,bedH] with no negative coords', () => {
    const params = P();
    const sheets = sheetsOf(params);
    let total = 0;
    for (const svg of sheets) {
      const { w, h } = sheetDim(svg);
      const boxes = rotatedLadderBoxes(svg);
      const ladderCount = (svg.match(/data-role="ladder"/g) || []).length;
      expect(boxes.length).toBe(ladderCount); // every ladder path is a rotated block sub-group
      for (const b of boxes) {
        expect(b.minX).toBeGreaterThanOrEqual(-1e-6);
        expect(b.minY).toBeGreaterThanOrEqual(-1e-6);
        expect(b.maxX).toBeLessThanOrEqual(w + 1e-6);
        expect(b.maxY).toBeLessThanOrEqual(h + 1e-6);
        total++;
      }
    }
    expect(total).toBe(4);
  });

  it('keeps the calibration square upright while per-rib labels rotate with their block', () => {
    for (const svg of sheetsOf(P())) {
      const flat = stripRotate(svg);
      expect(svg).toContain('data-role="calibration"');
      expect(flat).toContain('data-role="calibration"');   // calibration is NOT inside a rotate group
      expect(svg).toContain('data-role="rib-label"');
      expect(flat).not.toContain('data-role="rib-label"'); // every rib label rotates with its block
    }
  });
});
