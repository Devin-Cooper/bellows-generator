// tests/wall-rib-layout.test.js
import { describe, it, expect } from 'vitest';
import { computeWallRibLayout } from '../src/geometry/wallRibLayout.js';
import { computeMetrics } from '../src/geometry/metrics.js';
import { computeFaceFoldWidths } from '../src/geometry/tapered.js';
import { normalizeParams, DEFAULT_PARAMS } from '../src/params.js';

const P = normalizeParams({ ...DEFAULT_PARAMS });                 // square 150, ca 15
const IL = normalizeParams({ ...DEFAULT_PARAMS, cornerMode: 'interlock' });
const TP = normalizeParams({
  ...DEFAULT_PARAMS, type: 'tapered',
  rearW: 200, frontW: 100, rearH: 150, frontH: 80, ribCount: 5,
});

const wallEntries = (layout, wi) => layout.filter((e) => e.wallIndex === wi);
const clearRegion = (layout, wi) => {
  const es = wallEntries(layout, wi);
  return { left: Math.min(...es.map((e) => e.x)), right: Math.max(...es.map((e) => e.x + e.width)) };
};

describe('computeWallRibLayout — whole-rib unrolled placement', () => {
  it('lays out all 4 walls (W, H, W, H) with ribCount whole ribs each', () => {
    const layout = computeWallRibLayout(P);
    const { ribCount } = computeMetrics(P);
    const walls = [...new Set(layout.map((e) => e.wallIndex))].sort((a, b) => a - b);
    expect(walls).toEqual([0, 1, 2, 3]);
    expect([0, 1, 2, 3].map((wi) => wallEntries(layout, wi)[0].face)).toEqual(['W', 'H', 'W', 'H']);
    for (const wi of walls) expect(wallEntries(layout, wi).length).toBe(ribCount);
    expect(layout.length).toBe(4 * ribCount);
  });

  it('ribs are WHOLE (width = faceWidth - 2*cornerAllowance), never the split-W half', () => {
    const layout = computeWallRibLayout(P);
    const ca = P.cornerAllowance;
    for (const e of layout) {
      expect(e.width).toBeCloseTo(150 - 2 * ca, 6); // 120 whole
      expect(e.width).not.toBeCloseTo((150 - 2 * ca) / 2, 6); // NOT 60 half
    }
  });

  it('y = endMargin + ribIndex*pitch (shared, un-shifted datum + fabric origin)', () => {
    const layout = computeWallRibLayout(P);
    const { pitch } = computeMetrics(P);
    for (const e of layout) expect(e.y).toBeCloseTo(P.endMargin + e.ribIndex * pitch, 6);
  });

  it('adjacent wall panels leave a corner-fold gap (2 * cornerAllowance) between clear regions', () => {
    const layout = computeWallRibLayout(P);
    const ca = P.cornerAllowance;
    for (let k = 0; k < 3; k++) {
      const a = clearRegion(layout, k);
      const b = clearRegion(layout, k + 1);
      const gap = b.left - a.right;
      expect(gap).toBeGreaterThan(0);          // there IS a corner-fold gap
      expect(gap).toBeCloseTo(2 * ca, 6);      // = right ca of wall k + left ca of wall k+1
    }
  });

  it('interlock reach fits inside the cornerAllowance gap (half-points nest, never collide)', () => {
    const layout = computeWallRibLayout(IL);
    const ca = IL.cornerAllowance;
    for (const e of layout) {
      const reachR = Math.max(...e.points.map((p) => p.x)) - e.width; // past the right clear edge
      const reachL = -Math.min(...e.points.map((p) => p.x));          // past the left clear edge
      expect(reachR).toBeLessThanOrEqual(ca + 1e-9);
      expect(reachL).toBeLessThanOrEqual(ca + 1e-9);
    }
    // a wall's rightmost projected apex stays LEFT of the next wall's leftmost projected apex,
    // so the two halves nest in the shared corner-fold gap without overlapping.
    for (let k = 0; k < 3; k++) {
      const aRight = Math.max(...wallEntries(layout, k).map((e) => e.x + Math.max(...e.points.map((p) => p.x))));
      const bLeft = Math.min(...wallEntries(layout, k + 1).map((e) => e.x + Math.min(...e.points.map((p) => p.x))));
      expect(aRight).toBeLessThan(bLeft);
    }
  });

  it('tapered: still 4 walls; per-pleat rib widths flow through from computeFaceFoldWidths', () => {
    const layout = computeWallRibLayout(TP);
    expect([...new Set(layout.map((e) => e.wallIndex))].length).toBe(4);
    const { width: wFold } = computeFaceFoldWidths(TP);
    const ca = TP.cornerAllowance;
    const wWall = wallEntries(layout, 0).sort((a, b) => a.ribIndex - b.ribIndex);
    wWall.forEach((e, i) => expect(e.width).toBeCloseTo(wFold[i] - 2 * ca, 6));
  });
});
