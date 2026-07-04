// tests/metrics.test.js
import { describe, it, expect } from 'vitest';
import { computeRibCount } from '../src/geometry/metrics.js';

const BASE = {
  rib: 12, gap: 2.5, maxDraw: 300, drawFactor: 1.2, ribCount: null,
};

describe('computeRibCount', () => {
  it('sizes with the draw factor: 300mm draw -> 25 ribs', () => {
    expect(computeRibCount({ ...BASE })).toBe(25);
  });

  it('returns an explicit ribCount override untouched', () => {
    expect(computeRibCount({ ...BASE, ribCount: 40 })).toBe(40);
  });

  it('rounds (maxDraw*drawFactor - rib)/pitch + 1', () => {
    // (200*1.2 - 12)/14.5 = 15.72 -> round 16, +1 = 17
    expect(computeRibCount({ ...BASE, maxDraw: 200 })).toBe(17);
  });
});
