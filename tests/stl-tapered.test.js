// tests/stl-tapered.test.js
import { describe, it, expect } from 'vitest';
import { exportRibsSTL, computeRibOutlines } from '../src/export/stl.js';
import { buildPatternModel } from '../src/geometry/index.js';
import { DEFAULT_PARAMS } from '../src/params.js';

const triCount = (buf) => new DataView(buf).getUint32(80, true);

describe('tapered STL rib trapezoids', () => {
  const taper = {
    ...DEFAULT_PARAMS, type: 'tapered',
    rearW: 200, frontW: 100, rearH: 150, frontH: 80, ribCount: 5,
  };
  const straight = { ...DEFAULT_PARAMS, type: 'straight', ribCount: 5 };

  it('keeps triangle count = 12 * ribCount for a tapered bellows', () => {
    const model = buildPatternModel(taper);
    const buf = exportRibsSTL(model, taper);
    expect(buf.byteLength).toBe(84 + 12 * model.metrics.ribCount * 50);
    expect(triCount(buf)).toBe(12 * model.metrics.ribCount);
  });

  it('emits trapezoid rib outlines (w0 != w1) when tapered', () => {
    const model = buildPatternModel(taper);
    const outs = computeRibOutlines(model, taper);
    expect(outs.length).toBe(model.metrics.ribCount);
    expect(outs.some((o) => Math.abs(o.w0 - o.w1) > 1e-9)).toBe(true);
  });

  it('emits rectangular rib outlines (w0 == w1) when straight', () => {
    const model = buildPatternModel(straight);
    const outs = computeRibOutlines(model, straight);
    expect(outs.every((o) => Math.abs(o.w0 - o.w1) < 1e-9)).toBe(true);
    expect(triCount(exportRibsSTL(model, straight))).toBe(12 * model.metrics.ribCount);
  });
});
