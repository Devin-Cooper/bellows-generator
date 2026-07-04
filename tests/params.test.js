import { describe, it, expect } from 'vitest';
import { DEFAULT_PARAMS, A6_PRESET, normalizeParams } from '../src/params.js';
import { computeRibCount, computeMetrics } from '../src/geometry/metrics.js';

describe('DEFAULT_PARAMS', () => {
  it('carries the contract defaults', () => {
    expect(DEFAULT_PARAMS.type).toBe('straight');
    expect(DEFAULT_PARAMS.frontW).toBe(150);
    expect(DEFAULT_PARAMS.frontH).toBe(150);
    expect(DEFAULT_PARAMS.maxDraw).toBe(300);
    expect(DEFAULT_PARAMS.drawFactor).toBe(1.2);
    expect(DEFAULT_PARAMS.rib).toBe(12);
    expect(DEFAULT_PARAMS.gap).toBe(2.5);
    expect(DEFAULT_PARAMS.ribCount).toBeNull();
    expect(DEFAULT_PARAMS.cornerAllowance).toBe(15);
    expect(DEFAULT_PARAMS.glueTab).toBe(10);
    expect(DEFAULT_PARAMS.endMargin).toBe(35);
    expect(DEFAULT_PARAMS.pageSize).toBe('A4');
  });
});

describe('A6_PRESET', () => {
  it('is a 160x115 rectangular straight bellows', () => {
    expect(A6_PRESET.type).toBe('straight');
    expect(A6_PRESET.frontW).toBe(160);
    expect(A6_PRESET.frontH).toBe(115);
    expect(A6_PRESET.rearW).toBe(160);
    expect(A6_PRESET.rearH).toBe(115);
  });
});

describe('normalizeParams', () => {
  it('locks rear=front when type is straight', () => {
    const n = normalizeParams({ ...DEFAULT_PARAMS, frontW: 160, frontH: 115, rearW: 999, rearH: 888 });
    expect(n.rearW).toBe(160);
    expect(n.rearH).toBe(115);
  });

  it('leaves a null ribCount as null (auto — resolved downstream by computeMetrics)', () => {
    const n = normalizeParams({ ...DEFAULT_PARAMS });
    expect(n.ribCount).toBeNull();
  });

  it('computeRibCount resolves null ribCount from DEFAULT_PARAMS to 25', () => {
    expect(computeRibCount({ ...DEFAULT_PARAMS })).toBe(25);
  });

  it('computeMetrics resolves null ribCount from DEFAULT_PARAMS to 25', () => {
    expect(computeMetrics({ ...DEFAULT_PARAMS }).ribCount).toBe(25);
  });

  it('keeps an explicit ribCount override', () => {
    const n = normalizeParams({ ...DEFAULT_PARAMS, ribCount: 30 });
    expect(n.ribCount).toBe(30);
  });

  it('does not mutate the input object', () => {
    const input = { ...DEFAULT_PARAMS };
    normalizeParams(input);
    expect(input.ribCount).toBeNull();
  });
});
