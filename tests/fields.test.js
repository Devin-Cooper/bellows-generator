// @vitest-environment jsdom
// tests/fields.test.js
import { describe, it, expect } from 'vitest';
import { FIELDS, fieldMeta } from '../src/ui/fields.js';
import { DEFAULT_PARAMS } from '../src/params.js';

describe('FIELDS metadata', () => {
  it('has one complete entry for every DEFAULT_PARAMS key', () => {
    for (const key of Object.keys(DEFAULT_PARAMS)) {
      const meta = FIELDS[key];
      expect(meta, `missing FIELDS entry for ${key}`).toBeDefined();
      expect(typeof meta.label).toBe('string');
      expect(meta.label.length).toBeGreaterThan(0);
      expect(typeof meta.unit).toBe('string'); // '' means unitless
      expect(typeof meta.hint).toBe('string');
      expect(meta.hint.length).toBeGreaterThan(0);
    }
  });

  it('does not define fields for keys absent from DEFAULT_PARAMS', () => {
    for (const key of Object.keys(FIELDS)) {
      expect(Object.prototype.hasOwnProperty.call(DEFAULT_PARAMS, key)).toBe(true);
    }
  });

  it('marks select fields with kind + options matching the current controls', () => {
    expect(FIELDS.type.kind).toBe('select');
    expect(FIELDS.type.options).toEqual(['straight', 'tapered']);
    expect(FIELDS.pageSize.kind).toBe('select');
    expect(FIELDS.pageSize.options).toEqual(['A4', 'A3', 'Letter']);
  });

  it('carries the fine-grained steps from the current GROUPS', () => {
    expect(FIELDS.drawFactor.step).toBe(0.1);
    expect(FIELDS.gap.step).toBe(0.1);
    expect(FIELDS.fabricThickness.step).toBe(0.1);
    expect(FIELDS.ribThickness.step).toBe(0.1);
    expect(FIELDS.kerf.step).toBe(0.01);
  });

  it('uses friendly human labels (not raw camelCase keys)', () => {
    expect(FIELDS.frontW.label).toBe('Front width');
    expect(FIELDS.ribCount.label).toBe('Rib count (auto)');
    expect(FIELDS.frontW.unit).toBe('mm');
  });

  it('fieldMeta returns the entry, or a labelled fallback for unknown keys', () => {
    expect(fieldMeta('kerf')).toBe(FIELDS.kerf);
    expect(fieldMeta('nope')).toEqual({ label: 'nope', unit: '', hint: '' });
  });
});
