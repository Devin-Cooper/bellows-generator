// tests/tapered.test.js
import { describe, it, expect } from 'vitest';
import { computeFaceFoldWidths } from '../src/geometry/tapered.js';
import { DEFAULT_PARAMS } from '../src/params.js';
import { PHOTRIO_FIXTURES } from './fixtures/photrio.js';

const approx = (a, b) => Math.abs(a - b) < 1e-6;

describe('computeFaceFoldWidths vs Photrio fixtures', () => {
  for (const fx of PHOTRIO_FIXTURES) {
    it(fx.name, () => {
      const { width, height } = computeFaceFoldWidths({ ...DEFAULT_PARAMS, ...fx.params });
      expect(width.length).toBe(fx.width.length);
      expect(height.length).toBe(fx.height.length);
      width.forEach((w, i) => expect(approx(w, fx.width[i])).toBe(true));
      height.forEach((h, i) => expect(approx(h, fx.height[i])).toBe(true));
    });
  }

  it('is not a plain monotonic interpolation for a real taper', () => {
    const { width } = computeFaceFoldWidths({
      ...DEFAULT_PARAMS, type: 'tapered',
      rearW: 200, frontW: 100, rearH: 150, frontH: 80, ribCount: 5,
    });
    const baseline = width.map((_, i) => 200 - (100 / 4) * i);
    // at least one interior rib departs from the straight-line baseline
    expect(width.some((w, i) => Math.abs(w - baseline[i]) > 1e-6)).toBe(true);
  });
});
