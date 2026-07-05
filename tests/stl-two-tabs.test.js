// tests/stl-two-tabs.test.js
// Feature A: the bed-breakup STL now bridges each intra-segment gap with TWO breakaway tabs
// INSET from the clear-width ends (was one dead-centre tab) so the snap scar clears the
// corner-fold zone. The inset is cornerAllowance (a UI param, not paper-fold-gated), so we
// assert positions directly. Clear mode -> plain rectangles, so these tests are independent of
// the Feature 0 trapezoid numbers.
import { describe, it, expect } from 'vitest';
import { computeRibOutlines, bridgeTabXs } from '../src/export/stl.js';
import { DEFAULT_PARAMS } from '../src/params.js';

const model = { segments: [], regions: [], seamFaceIndex: 0, bounds: { w: 0, h: 0 }, metrics: { ribCount: 5 } };
const base = {
  ...DEFAULT_PARAMS, type: 'straight', ribCount: 5,
  frontW: 150, frontH: 150, rearW: 150, rearH: 150,
  cornerAllowance: 15, rib: 12, gap: 2.5, ribThickness: 0.4, printOffset: 0,
  bedSize: 1000,
};
const xMid = (b) => (Math.min(...b.points.map((p) => p.x)) + Math.max(...b.points.map((p) => p.x))) / 2;
const wBridges = (outs) => outs.filter((o) => o.kind === 'bridge' && o.face === 'W');
const wRibs = (outs) => outs.filter((o) => o.kind === 'rib' && o.face === 'W');

describe('STL two inset breakaway tabs (Feature A)', () => {
  it('bridges each intra-segment gap with TWO tabs (was one centred tab)', () => {
    const outs = computeRibOutlines(model, base);      // 5 W ribs, 1 segment -> 4 gaps
    expect(wBridges(outs).length).toBe(8);             // 4 gaps x 2 tabs
  });

  it('the two tabs are inset by cornerAllowance from each clear edge (never dead-centre)', () => {
    const outs = computeRibOutlines(model, base);
    const rib = wRibs(outs)[0];
    const xmin = Math.min(...rib.points.map((p) => p.x));
    const xmax = Math.max(...rib.points.map((p) => p.x));
    const cx = (xmin + xmax) / 2;
    const width = xmax - xmin;                         // 120
    // all ribs share the column centre, so every left tab is one x and every right tab another
    const centres = [...new Set(wBridges(outs).map((b) => Number(xMid(b).toFixed(6))))].sort((a, c) => a - c);
    expect(centres.length).toBe(2);
    expect(centres[0]).toBeCloseTo(cx - width / 2 + base.cornerAllowance, 6); // left tab @ clear-left + ca
    expect(centres[1]).toBeCloseTo(cx + width / 2 - base.cornerAllowance, 6); // right tab @ clear-right - ca
    for (const c of centres) expect(Math.abs(c - cx)).toBeLessThan(width / 2); // strictly inside the clear width
    expect(centres.some((c) => Math.abs(c - cx) < 1e-6)).toBe(false);         // not the old centre tab
  });

  it('tapered: each tab lands within BOTH adjacent ribs (placed on the narrower clear width)', () => {
    const taper = { ...base, type: 'tapered', rearW: 200, frontW: 100, rearH: 150, frontH: 80 };
    const outs = computeRibOutlines(model, taper);
    const spanOf = (r) => ({ lo: Math.min(...r.points.map((p) => p.x)), hi: Math.max(...r.points.map((p) => p.x)) });
    for (const face of ['W', 'H']) {
      const ribs = outs.filter((o) => o.kind === 'rib' && o.face === face).sort((a, b) => a.ribIndex - b.ribIndex);
      const bridges = outs.filter((o) => o.kind === 'bridge' && o.face === face);
      expect(bridges.length).toBeGreaterThan(0);
      for (const b of bridges) {
        const li = ribs.findIndex((r) => r.ribIndex === b.ribIndex);
        const lower = spanOf(ribs[li]);
        const upper = spanOf(ribs[li + 1]);
        const c = xMid(b);
        expect(c).toBeGreaterThanOrEqual(Math.max(lower.lo, upper.lo) - 1e-9);
        expect(c).toBeLessThanOrEqual(Math.min(lower.hi, upper.hi) + 1e-9);
      }
    }
  });

  it('a small face (clearWidth < 2*(ca + BRIDGE_WIDTH/2)) falls back to ONE centred tab', () => {
    const tiny = { ...base, frontW: 34, frontH: 34, rearW: 34, rearH: 34, ribCount: 3 }; // width = 4
    const outs = computeRibOutlines(model, tiny);
    const bridges = outs.filter((o) => o.kind === 'bridge' && o.face === 'W');           // 3 ribs -> 2 gaps
    expect(bridges.length).toBe(2);                                                       // one clamped tab per gap
    const rib = outs.find((o) => o.kind === 'rib' && o.face === 'W');
    const cx = (Math.min(...rib.points.map((p) => p.x)) + Math.max(...rib.points.map((p) => p.x))) / 2;
    for (const b of bridges) expect(xMid(b)).toBeCloseTo(cx, 6);
  });

  it('bridgeTabXs: two inset tabs normally, one centred tab on a small face', () => {
    expect(bridgeTabXs(120, 0, 15)).toEqual([-45, 45]);
    expect(bridgeTabXs(4, 7, 15)).toEqual([7]); // 4 < 2*(15+1)=32 -> clamp
  });
});
