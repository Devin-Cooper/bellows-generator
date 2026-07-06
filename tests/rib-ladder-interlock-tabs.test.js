// tests/rib-ladder-interlock-tabs.test.js
// RE-ADDED guard (was the FIX1 case in the deleted tests/rib-ladder-pointed-ladder.test.js): the
// snap-apart connector-tab notches on an INTERLOCK master sheet must land ON the rib's CLEAR width
// [0, clearW] — never out at the interlock POINT TIPS (x = colX0 - reach / x = colX0 + clearW +
// reach). traceColumn floors/caps each notch edge to [0, clearW] (leftEdge = Math.max(0, ...),
// rightEdge = Math.min(clearW, ...)); at an OUTWARD gap BOTH adjacent rib edges are the wide base,
// so without that floor/cap the tab would relocate onto the point, `reach` mm outside the clear
// width. This asserts every notch stays within the clear width for every wall column.
import { describe, it, expect } from 'vitest';
import { renderRibMasterSheets, packRibSheets, collectWalls } from '../src/render/svg.js';
import { cornerReachSetback } from '../src/geometry/ribShapes.js';
import { buildPatternModel } from '../src/geometry/index.js';
import { normalizeParams, DEFAULT_PARAMS } from '../src/params.js';

const SHEET_MARGIN = 5; // mirrors svg.js: colX0 = block.x + kerf/2 + block.leftPad

// All <path data-role="ladder"> attribute maps across every bed sheet.
function ladderPaths(sheets) {
  const out = [];
  for (const svg of sheets) {
    const re = /<path ([^>]*?)\/>/g;
    let m;
    while ((m = re.exec(svg)) !== null) {
      const attrs = {};
      const are = /([\w-]+)="([^"]*)"/g;
      let a;
      while ((a = are.exec(m[1])) !== null) attrs[a[1]] = a[2];
      if (attrs['data-role'] === 'ladder') out.push(attrs);
    }
  }
  return out;
}
// Z-delimited subpaths of a path d; subpaths[0] = outer boundary, the rest are tab-notch rectangles.
function subpathsOf(d) {
  return d
    .split('Z')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const nums = s.match(/-?[\d.]+/g).map(Number);
      const pts = [];
      for (let i = 0; i < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
      return pts;
    });
}

describe('renderRibMasterSheets interlock — connector tabs stay within the clear width', () => {
  const p = normalizeParams({ ...DEFAULT_PARAMS, cornerMode: 'interlock' });
  const model = buildPatternModel(p);
  const sheets = renderRibMasterSheets(model, p);
  const paths = ladderPaths(sheets);
  // The packer's blocks carry the exact placement (block.x, leftPad, widthMax, ribs) so we can
  // reconstruct each column's colX0 and clearW independently of the rendered path.
  const blocks = packRibSheets(collectWalls(p), p).flatMap((s) => s.blocks);

  it('renders interlock columns with notch subpaths to inspect (setup sanity)', () => {
    expect(paths.length).toBeGreaterThan(0);
    expect(blocks.length).toBe(paths.length);
    // reach is strictly positive at defaults (rib=12 -> depth/2=6, ca=15 -> reach=6) so the
    // OUTWARD point tips genuinely project past the clear edge — there IS something to avoid.
    const reach = cornerReachSetback(p.rib, p.cornerAllowance).reach;
    expect(reach).toBeGreaterThan(0);
  });

  it('every wall column: each connector-tab notch x lies within [colX0, colX0+clearW], off the point tips', () => {
    const reach = cornerReachSetback(p.rib, p.cornerAllowance).reach;
    let notchTotal = 0;
    for (const block of blocks) {
      const path = paths.find(
        (a) =>
          a['data-face'] === block.face &&
          a['data-wall'] === String(block.wallIndex) &&
          a['data-seg'] === String(block.segIndex)
      );
      expect(path, `path for ${block.face}${block.wallIndex} seg${block.segIndex}`).toBeTruthy();

      const colX0 = (block.rotated ? 0 : block.x) + p.kerf / 2 + block.leftPad; // block-LOCAL when rotated
      const clearW = Math.min(...block.ribs.map((r) => r.width));
      const leftTip = colX0 - reach; // -reach point tip (outside the clear width)
      const rightTip = colX0 + clearW + reach; // width+reach point tip

      const subs = subpathsOf(path.d);
      const notches = subs.slice(1); // subs[0] is the outer boundary
      expect(notches.length).toBeGreaterThan(0);
      for (const n of notches) {
        const minX = Math.min(...n.map((q) => q.x));
        const maxX = Math.max(...n.map((q) => q.x));
        // Within the rib's CLEAR width — the floor/cap in traceColumn keeps the tab off the point.
        expect(minX).toBeGreaterThanOrEqual(colX0 - 1e-6);
        expect(maxX).toBeLessThanOrEqual(colX0 + clearW + 1e-6);
        // And therefore NOT out at either interlock point tip (x = colX0 - reach / colX0+clearW+reach).
        expect(minX).toBeGreaterThan(leftTip + 1e-6);
        expect(maxX).toBeLessThan(rightTip - 1e-6);
        notchTotal++;
      }
    }
    expect(notchTotal).toBeGreaterThan(0);
  });
});
