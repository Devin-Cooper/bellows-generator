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

  it('re-derives ribCount when maxDraw changes with null ribCount (auto)', () => {
    // round((450*1.2 - 12)/14.5) + 1 = round(528/14.5) + 1 = round(36.41) + 1 = 36 + 1 = 37
    const m = computeMetrics({ ...FULL, maxDraw: 450 });
    expect(m.ribCount).toBe(37);
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

  it('derives the stiffened opening (face − 2·CA) and rib-to-rib corner gap (2·CA)', () => {
    const m = computeMetrics({ ...FULL, frontW: 150, frontH: 150, cornerAllowance: 15 });
    // 150 − 2·15 = 120; front == rear for a straight bellows.
    expect(m.stiffenedOpening.front).toEqual({ w: 120, h: 120 });
    expect(m.stiffenedOpening.rear).toEqual({ w: 120, h: 120 });
    expect(m.cornerGap).toBe(30);
  });

  it('keeps the stiffened opening close to the face with the small default-style allowance', () => {
    // Regression for the "100×100 opening prints as ~70×70" report: a small corner allowance keeps
    // the rigid frame near the nominal face and the corner gap at a few mm.
    const m = computeMetrics({ ...FULL, frontW: 100, frontH: 100, cornerAllowance: 2 });
    expect(m.stiffenedOpening.front).toEqual({ w: 96, h: 96 });
    expect(m.cornerGap).toBe(4);
  });

  it('splits front/rear stiffened openings for a tapered bellows', () => {
    const m = computeMetrics({
      ...FULL, type: 'tapered', frontW: 100, frontH: 100, rearW: 60, rearH: 60, cornerAllowance: 2,
    });
    expect(m.stiffenedOpening.front).toEqual({ w: 96, h: 96 });
    expect(m.stiffenedOpening.rear).toEqual({ w: 56, h: 56 });
  });
});
