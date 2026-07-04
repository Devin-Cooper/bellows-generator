// tests/metrics.test.js
import { describe, it, expect } from 'vitest';
import { computeRibCount } from '../src/geometry/metrics.js';
import { computeMetrics } from '../src/geometry/metrics.js';

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

const FULL = {
  type: 'straight',
  frontW: 150, frontH: 150, rearW: 150, rearH: 150,
  maxDraw: 300, drawFactor: 1.2,
  rib: 12, gap: 2.5, ribCount: null, cornerAllowance: 15,
  glueTab: 10, endMargin: 35,
  fabricThickness: 0.5, ribThickness: 0.4, kerf: 0.15,
  focalLength: 150, opticalOffset: 40, pageSize: 'A4',
};

describe('computeMetrics', () => {
  it('derives the default read-outs', () => {
    const m = computeMetrics({ ...FULL });
    expect(m.ribCount).toBe(25);
    expect(m.N).toBe(24);
    expect(m.pitch).toBe(14.5);
    expect(m.flatPleatedLength).toBe(360);
    expect(m.usableDraw).toBe(271);
    expect(m.collapsedThickness).toBeCloseTo(22.5, 6);
    expect(m.magnification).toBeCloseTo((271 + 40) / 150 - 1, 6);
    expect(m.flatSheet).toEqual({ w: 610, h: 430 });
  });

  it('warns above 20mm collapse but not on kerf by default', () => {
    const m = computeMetrics({ ...FULL });
    expect(m.warnings).toContain('>20mm collapse');
    expect(m.warnings).not.toContain('kerf>=gap');
  });

  it('warns when kerf >= gap', () => {
    const m = computeMetrics({ ...FULL, kerf: 3 });
    expect(m.warnings).toContain('kerf>=gap');
  });
});
