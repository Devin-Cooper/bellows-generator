// tests/rib-ladder-interlock-tabs.test.js
// Guard on the INTERLOCK master sheet, split into the two properties that must BOTH hold:
//   1. Each snap-apart connector TAB (the UNCUT strip left between cuts) lands ON the rib's CLEAR
//      width [colX0, colX0+clearW] — never out at the interlock POINT TIPS (colX0-reach /
//      colX0+clearW+reach). The tab span is clamped to the clear overlap, so tabs sit off the points.
//   2. The CUT itself runs across the FULL gap extent — out to the point tips on an OUTWARD gap
//      (both facing edges are the wide base) — so the tip triangles are cut free and never WEB the
//      ribs together at the fold points. (Clamping the CUT to the clear width, as an earlier version
//      did, left those webs; this test now pins the cut reaching past the clear edge.)
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
// Z-delimited subpaths of a path d; subpaths[0] = outer boundary, the rest are cut-notch rectangles.
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

// Group cut-notch rectangles by the gap (y-band) they belong to; each gap -> its x-intervals.
function notchesByGap(notches) {
  const byBand = new Map();
  for (const n of notches) {
    const ys = n.map((q) => q.y);
    const xs = n.map((q) => q.x);
    const key = Math.round(((Math.min(...ys) + Math.max(...ys)) / 2) * 100) / 100;
    if (!byBand.has(key)) byBand.set(key, []);
    byBand.get(key).push([Math.min(...xs), Math.max(...xs)]);
  }
  return [...byBand.values()].map((iv) => iv.sort((a, b) => a[0] - b[0]));
}

// The UNCUT connector tabs of one gap: the complement of the cut intervals within [lo, hi] wider
// than minW (kerf leaves ~kerf/2 slivers at fully-cut ends).
function uncutTabs(ivals, lo, hi, minW) {
  const tabs = [];
  let cursor = lo;
  for (const [a, b] of ivals) {
    if (a - cursor > minW) tabs.push((cursor + a) / 2);
    cursor = Math.max(cursor, b);
  }
  if (hi - cursor > minW) tabs.push((cursor + hi) / 2);
  return tabs;
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

  it('every wall column: TABS stay within the clear width while the CUT reaches the tips (no web)', () => {
    const reach = cornerReachSetback(p.rib, p.cornerAllowance).reach;
    const half = p.kerf / 2;
    let tabTotal = 0;
    let outwardGaps = 0; // count of gaps whose cut ran out past the clear edge (the web-cut path)
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

      const notches = subpathsOf(path.d).slice(1); // subs[0] is the outer boundary
      expect(notches.length).toBeGreaterThan(0);
      const gaps = notchesByGap(notches);
      for (const ivals of gaps) {
        const gLo = Math.min(...ivals.map(([a]) => a));
        const gHi = Math.max(...ivals.map(([, b]) => b));
        // 1. Every connector TAB (uncut strip) lands within the rib's CLEAR width, off the tips.
        const tabs = uncutTabs(ivals, gLo, gHi, 0.5);
        expect(tabs.length).toBeGreaterThanOrEqual(1);
        for (const c of tabs) {
          expect(c).toBeGreaterThan(colX0 - 1e-6);
          expect(c).toBeLessThan(colX0 + clearW + 1e-6);
          tabTotal++;
        }
        // 2. An OUTWARD gap's cut runs out to the point tips (colX0-reach / colX0+clearW+reach) so the
        //    tip triangles are cut free — no web. An INWARD gap's cut stays within the clear width.
        if (gHi - gLo > clearW + 0.5) {
          outwardGaps++;
          expect(gLo).toBeLessThan(colX0); // cut runs LEFT past the clear edge -> no left web
          expect(gHi).toBeGreaterThan(colX0 + clearW); // cut runs RIGHT past the clear edge -> no right web
          // The cut edge sits exactly at the point tip, kerf/2 inside it: gLo = colX0 - reach + half.
          expect(colX0 - gLo).toBeCloseTo(reach - half, 1);
        } else {
          expect(gLo).toBeGreaterThanOrEqual(colX0 - 1e-6); // no material outside the clear width
          expect(gHi).toBeLessThanOrEqual(colX0 + clearW + 1e-6);
        }
      }
    }
    expect(tabTotal).toBeGreaterThan(0);
    expect(outwardGaps).toBeGreaterThan(0); // the web-cut path was actually exercised
  });
});
