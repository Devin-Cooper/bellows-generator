// @vitest-environment jsdom
// tests/fields-stiffener.test.js
import { describe, it, expect } from 'vitest';
import { FIELDS, fieldMeta } from '../src/ui/fields.js';
import { DEFAULT_PARAMS } from '../src/params.js';

describe('FIELDS — stiffener overhaul params', () => {
  it('cornerMode is a select with the three canonical modes and friendly copy', () => {
    const m = FIELDS.cornerMode;
    expect(m, 'FIELDS.cornerMode missing').toBeDefined();
    expect(m.kind).toBe('select');
    expect(m.options).toEqual(['clear', 'pointed', 'alternating']);
    expect(m.label).toBe('Corner stiffening');
    expect(m.unit).toBe(''); // unitless select
    // hint spells out the crisp-corner vs thin-pack trade-off
    expect(m.hint.length).toBeGreaterThan(0);
    expect(m.hint).toMatch(/point|crisp|corner/i);
    expect(m.hint).toMatch(/pack|bulk|thin|thick/i);
  });

  it('bedSize is a mm numeric with a bed-segmentation hint', () => {
    const m = FIELDS.bedSize;
    expect(m, 'FIELDS.bedSize missing').toBeDefined();
    expect(m.kind).toBeUndefined(); // plain number input
    expect(m.label.length).toBeGreaterThan(0);
    expect(m.unit).toBe('mm');
    expect(m.hint).toMatch(/bed|segment|split/i);
  });

  it('printOffset is a mm numeric describing the inward shrink', () => {
    const m = FIELDS.printOffset;
    expect(m, 'FIELDS.printOffset missing').toBeDefined();
    expect(m.label.length).toBeGreaterThan(0);
    expect(m.unit).toBe('mm');
    expect(m.step).toBe(0.1);
    expect(m.hint).toMatch(/inward|shrink|over-?extru|elephant/i);
  });

  it('keeps FIELDS in lockstep with DEFAULT_PARAMS (no orphan keys, full coverage)', () => {
    for (const key of Object.keys(DEFAULT_PARAMS)) {
      expect(FIELDS[key], `missing FIELDS entry for ${key}`).toBeDefined();
    }
    for (const key of Object.keys(FIELDS)) {
      expect(Object.prototype.hasOwnProperty.call(DEFAULT_PARAMS, key)).toBe(true);
    }
    // fallback still works for unknown keys
    expect(fieldMeta('bedSize')).toBe(FIELDS.bedSize);
  });
});
