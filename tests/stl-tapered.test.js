// tests/stl-tapered.test.js
import { describe, it, expect } from 'vitest';
import { exportRibsSTL, computeRibOutlines } from '../src/export/stl.js';
import { buildPatternModel } from '../src/geometry/index.js';
import { DEFAULT_PARAMS } from '../src/params.js';

const xExtent = (pts) => Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
const wWidths = (outs) => outs.filter((o) => o.kind === 'rib' && o.face === 'W').map((o) => Number(xExtent(o.points).toFixed(4)));

describe('tapered STL rib trapezoids', () => {
  const taper = { ...DEFAULT_PARAMS, type: 'tapered', rearW: 200, frontW: 100, rearH: 150, frontH: 80, ribCount: 5, cornerAllowance: 15, bedSize: 1000, printOffset: 0 };
  const straight = { ...DEFAULT_PARAMS, type: 'straight', ribCount: 5, cornerAllowance: 15, bedSize: 1000, printOffset: 0 };

  it('header count matches the emitted solids for a tapered bellows', () => {
    const model = buildPatternModel(taper);
    const buf = exportRibsSTL(model, taper);
    const expected = computeRibOutlines(model, taper).reduce((n, s) => n + 4 * s.points.length - 4, 0);
    expect(new DataView(buf).getUint32(80, true)).toBe(expected);
    expect(buf.byteLength).toBe(84 + expected * 50);
  });

  it('tapered W ribs vary in width across pleats (per-pleat, not one width)', () => {
    const model = buildPatternModel(taper);
    expect(new Set(wWidths(computeRibOutlines(model, taper))).size).toBeGreaterThan(1);
  });

  it('straight W ribs are all the same inset width (120)', () => {
    const model = buildPatternModel(straight);
    const w = wWidths(computeRibOutlines(model, straight));
    expect(new Set(w).size).toBe(1);
    expect(w[0]).toBeCloseTo(120, 6);
  });

  it('emits both W and H families (P2)', () => {
    const model = buildPatternModel(straight);
    const faces = new Set(computeRibOutlines(model, straight).filter((o) => o.kind === 'rib').map((o) => o.face));
    expect(faces.has('W') && faces.has('H')).toBe(true);
  });
});
