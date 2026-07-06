import { describe, it, expect } from 'vitest';
import { DEFAULT_PARAMS, normalizeParams, paramsFromQuery, paramsToQuery } from '../src/params.js';
import { FIELDS } from '../src/ui/fields.js';

describe('corner-comb field metadata (FIELDS ⟺ DEFAULT_PARAMS lockstep)', () => {
  it('cornerCombs is a bool field and combToothWidth is a mm number', () => {
    expect(FIELDS.cornerCombs.kind).toBe('bool');
    expect(FIELDS.cornerCombs.label.length).toBeGreaterThan(0);
    expect(FIELDS.combToothWidth.unit).toBe('mm');
    expect(FIELDS.combToothWidth.kind).toBeUndefined(); // plain number
  });
});

describe('corner-comb params', () => {
  it('DEFAULT_PARAMS carries cornerCombs=false and combToothWidth=5', () => {
    expect(DEFAULT_PARAMS.cornerCombs).toBe(false);
    expect(DEFAULT_PARAMS.combToothWidth).toBe(5);
  });

  it('normalizeParams clamps combToothWidth to [1, rib]', () => {
    expect(normalizeParams({ ...DEFAULT_PARAMS, rib: 12, combToothWidth: 999 }).combToothWidth).toBe(12);
    expect(normalizeParams({ ...DEFAULT_PARAMS, rib: 12, combToothWidth: 0 }).combToothWidth).toBe(1);
    expect(normalizeParams({ ...DEFAULT_PARAMS, rib: 12, combToothWidth: 6 }).combToothWidth).toBe(6);
  });

  it('normalizeParams coerces cornerCombs to a boolean', () => {
    expect(normalizeParams({ ...DEFAULT_PARAMS, cornerCombs: 'true' }).cornerCombs).toBe(true);
    expect(normalizeParams({ ...DEFAULT_PARAMS, cornerCombs: 'false' }).cornerCombs).toBe(false);
    expect(normalizeParams({ ...DEFAULT_PARAMS, cornerCombs: true }).cornerCombs).toBe(true);
    expect(normalizeParams({ ...DEFAULT_PARAMS }).cornerCombs).toBe(false);
  });

  it('paramsFromQuery round-trips the boolean + number', () => {
    const p = paramsFromQuery('?cornerCombs=true&combToothWidth=8');
    expect(p.cornerCombs).toBe(true);
    expect(p.combToothWidth).toBe(8);
  });

  it('paramsToQuery omits default cornerCombs and emits it when on', () => {
    expect(paramsToQuery({ ...DEFAULT_PARAMS })).not.toMatch(/cornerCombs/);
    expect(paramsToQuery({ ...DEFAULT_PARAMS, cornerCombs: true })).toMatch(/cornerCombs=true/);
  });
});
