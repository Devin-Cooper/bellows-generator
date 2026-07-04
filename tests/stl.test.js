// tests/stl.test.js
import { describe, it, expect } from 'vitest';
import { exportRibsSTL } from '../src/export/stl.js';
import { DEFAULT_PARAMS } from '../src/params.js';

function modelWith(ribCount) {
  return { segments: [], regions: [], seamFaceIndex: 0, bounds: { w: 0, h: 0 }, metrics: { ribCount } };
}

const params = {
  ...DEFAULT_PARAMS,
  rib: 12,
  gap: 2.5,
  frontW: 150,
  cornerAllowance: 15,
  ribThickness: 0.4,
};

describe('exportRibsSTL', () => {
  it('returns an ArrayBuffer with binary STL header + count structure', () => {
    const buf = exportRibsSTL(modelWith(5), params);
    expect(buf).toBeInstanceOf(ArrayBuffer);
    const view = new DataView(buf);
    const triCount = view.getUint32(80, true);
    expect(triCount).toBe(12 * 5);
    expect(buf.byteLength).toBe(84 + triCount * 50);
  });

  it('emits 12 triangles per rib for a different rib count', () => {
    const buf = exportRibsSTL(modelWith(25), params);
    const view = new DataView(buf);
    expect(view.getUint32(80, true)).toBe(12 * 25);
    expect(buf.byteLength).toBe(84 + 300 * 50);
  });

  it('writes finite float coordinates for the first triangle', () => {
    const buf = exportRibsSTL(modelWith(3), params);
    const view = new DataView(buf);
    for (let i = 0; i < 12; i++) {
      expect(Number.isFinite(view.getFloat32(84 + i * 4, true))).toBe(true);
    }
  });
});
