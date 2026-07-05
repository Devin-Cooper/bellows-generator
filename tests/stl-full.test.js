// tests/stl-full.test.js
// Feature B: a second STL export lays out all FOUR WHOLE walls (W,H,W,H) unrolled at their
// fabric positions (computeWallRibLayout) with corner-fold gaps between walls, each wall a
// two-inset-tab snap-apart lattice, y = endMargin + ribIndex*pitch, NO bed-wrap. The bed-breakup
// STL (exportRibsSTL) is unchanged. Provisional corner numbers stay paper-fold-gated; we assert
// the layout CONSTRUCTION (4 walls, whole ribs, gaps, y datum, tabs) + a manifold header.
import { describe, it, expect } from 'vitest';
import { exportFullRibsSTL, computeFullRibOutlines } from '../src/export/stl.js';
import { computeWallRibLayout } from '../src/geometry/wallRibLayout.js';
import { computeMetrics } from '../src/geometry/metrics.js';
import { normalizeParams, DEFAULT_PARAMS } from '../src/params.js';

const model = { segments: [], regions: [], seamFaceIndex: 0, bounds: { w: 0, h: 0 }, metrics: { ribCount: 5 } };
const base = {
  ...DEFAULT_PARAMS, type: 'straight', ribCount: 5,
  frontW: 160, frontH: 115, rearW: 160, rearH: 115,   // rectangular -> distinct W/H widths
  cornerAllowance: 15, rib: 12, gap: 2.5, ribThickness: 0.4, printOffset: 0, endMargin: 35,
};
const ribs = (outs) => outs.filter((o) => o.kind === 'rib');
const wallSpan = (outs, wallIndex) => {
  const r = ribs(outs).filter((o) => o.wallIndex === wallIndex);
  return {
    xMin: Math.min(...r.flatMap((o) => o.points.map((p) => p.x))),
    xMax: Math.max(...r.flatMap((o) => o.points.map((p) => p.x))),
  };
};

describe('exportFullRibsSTL / computeFullRibOutlines — full flat layout (Feature B)', () => {
  it('emits all four whole walls (2 W + 2 H) in W,H,W,H order', () => {
    const outs = computeFullRibOutlines(model, base);
    const walls = [...new Set(ribs(outs).map((o) => o.wallIndex))].sort((a, b) => a - b);
    expect(walls).toEqual([0, 1, 2, 3]);
    const faceOf = (wi) => ribs(outs).find((o) => o.wallIndex === wi).face;
    expect([0, 1, 2, 3].map(faceOf)).toEqual(['W', 'H', 'W', 'H']);
  });

  it('lays walls left-to-right with a positive corner-fold gap between them', () => {
    const outs = computeFullRibOutlines(model, base);
    for (let wi = 0; wi < 3; wi++) {
      const a = wallSpan(outs, wi);
      const b = wallSpan(outs, wi + 1);
      expect(b.xMin).toBeGreaterThan(a.xMax); // next wall starts past the previous (fold gap)
    }
  });

  it('ribs are WHOLE (clear width = faceWidth - 2*ca), never split-W halves', () => {
    const outs = computeFullRibOutlines(model, base);
    const layout = computeWallRibLayout(normalizeParams(base));
    expect(layout.find((e) => e.face === 'W').width).toBeCloseTo(130, 6); // 160 - 2*15
    expect(layout.find((e) => e.face === 'H').width).toBeCloseTo(85, 6);  // 115 - 2*15
    const wRib = ribs(outs).find((o) => o.face === 'W');
    const w = Math.max(...wRib.points.map((p) => p.x)) - Math.min(...wRib.points.map((p) => p.x));
    expect(w).toBeCloseTo(130, 6);   // whole
    expect(w).not.toBeCloseTo(65, 1); // not a split-W half
  });

  it('y = endMargin + ribIndex*pitch (shared datum, no bed-wrap shift)', () => {
    const outs = computeFullRibOutlines(model, base);
    const { pitch } = computeMetrics(normalizeParams(base));
    const wall0 = ribs(outs).filter((o) => o.wallIndex === 0).sort((a, b) => a.ribIndex - b.ribIndex);
    expect(wall0.length).toBe(5);
    for (const r of wall0) {
      const yMin = Math.min(...r.points.map((p) => p.y));
      expect(yMin).toBeCloseTo(base.endMargin + r.ribIndex * pitch, 6); // printOffset 0
    }
  });

  it('each wall is a snap-apart lattice: two inset tabs per intra-wall gap (no bed-wrap)', () => {
    const outs = computeFullRibOutlines(model, base);
    for (const wi of [0, 1, 2, 3]) {
      const nRibs = ribs(outs).filter((o) => o.wallIndex === wi).length;                    // 5
      const nBridges = outs.filter((o) => o.kind === 'bridge' && o.wallIndex === wi).length;
      expect(nBridges).toBe(2 * (nRibs - 1));                                                // 4 gaps x 2 tabs
    }
  });

  it('exportFullRibsSTL is a manifold binary STL (header = sum(4V-4), byteLength matches)', () => {
    const buf = exportFullRibsSTL(model, base);
    expect(buf).toBeInstanceOf(ArrayBuffer);
    const solids = computeFullRibOutlines(model, base);
    const expected = solids.reduce((n, s) => n + 4 * s.points.length - 4, 0);
    const tri = new DataView(buf).getUint32(80, true);
    expect(tri).toBe(expected);
    expect(buf.byteLength).toBe(84 + tri * 50);
    expect(new Set(solids.filter((s) => s.kind === 'rib').map((s) => s.wallIndex)).size).toBe(4);
  });

  it('applies an INWARD printOffset (each rib shrinks, like the bed STL)', () => {
    const xw = (o) => Math.max(...o.points.map((p) => p.x)) - Math.min(...o.points.map((p) => p.x));
    const wide = computeFullRibOutlines(model, { ...base, printOffset: 0 }).find((o) => o.kind === 'rib' && o.face === 'W');
    const narrow = computeFullRibOutlines(model, { ...base, printOffset: 0.5 }).find((o) => o.kind === 'rib' && o.face === 'W');
    expect(xw(narrow)).toBeLessThan(xw(wide));
    expect(xw(narrow)).toBeCloseTo(130 - 2 * 0.5, 6);
  });
});
