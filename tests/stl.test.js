// tests/stl.test.js
import { describe, it, expect } from 'vitest';
import { exportRibsSTL, computeRibOutlines } from '../src/export/stl.js';
import { DEFAULT_PARAMS } from '../src/params.js';

// rib count now comes from params (computeRibShapes), so the fake model is inert.
const model = (ribCount) => ({ segments: [], regions: [], seamFaceIndex: 0, bounds: { w: 0, h: 0 }, metrics: { ribCount } });
const params = {
  ...DEFAULT_PARAMS, type: 'straight', ribCount: 5,
  frontW: 150, frontH: 150, rearW: 150, rearH: 150,
  cornerAllowance: 15, rib: 12, gap: 2.5, ribThickness: 0.4,
  bedSize: 1000, printOffset: 0,
};
const expectedTris = (m, p) => computeRibOutlines(m, p).reduce((n, s) => n + 4 * s.points.length - 4, 0);

describe('exportRibsSTL', () => {
  it('returns a binary STL whose header count matches the emitted (shape-aware) solids', () => {
    const buf = exportRibsSTL(model(5), params);
    expect(buf).toBeInstanceOf(ArrayBuffer);
    const tri = new DataView(buf).getUint32(80, true);
    expect(tri).toBe(expectedTris(model(5), params));
    expect(buf.byteLength).toBe(84 + tri * 50);
  });

  it('scales with the params rib count (not the fake model metrics)', () => {
    const big = { ...params, ribCount: 25 };
    const tri = new DataView(exportRibsSTL(model(25), big)).getUint32(80, true);
    expect(tri).toBe(expectedTris(model(25), big));
  });

  it('writes finite float coordinates for the first triangle', () => {
    const p3 = { ...params, ribCount: 3 };
    const dv = new DataView(exportRibsSTL(model(3), p3));
    for (let i = 0; i < 12; i++) expect(Number.isFinite(dv.getFloat32(84 + i * 4, true))).toBe(true);
  });
});
