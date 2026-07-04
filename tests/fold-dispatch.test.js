// tests/fold-dispatch.test.js
import { describe, it, expect } from 'vitest';
import { buildFoldModel as dispatch } from '../src/geometry/index.js';
import { buildFoldModel as straight } from '../src/geometry/fold.js';
import { DEFAULT_PARAMS } from '../src/params.js';

describe('geometry index buildFoldModel dispatch', () => {
  it('routes straight params to the pleated ring builder', () => {
    const viaIndex = dispatch(DEFAULT_PARAMS, 0.5);
    const direct = straight(DEFAULT_PARAMS, 0.5);
    expect(viaIndex.positions).toEqual(direct.positions);
    expect(viaIndex.indices).toEqual(direct.indices);
    expect(viaIndex.axialLength).toBeCloseTo(direct.axialLength, 6);
    expect(viaIndex.extension).toBe(0.5);
  });

  it('routes tapered params through the same builder for now', () => {
    const tapered = { ...DEFAULT_PARAMS, type: 'tapered' };
    const m = dispatch(tapered, 1);
    expect(m.positions.length).toBeGreaterThan(0);
    expect(m.axialLength).toBeCloseTo(straight(tapered, 1).axialLength, 6);
  });
});
