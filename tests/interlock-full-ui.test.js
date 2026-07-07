// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { FIELDS } from '../src/ui/fields.js';
import { buildControlPanel } from '../src/ui/controls.js';
import { normalizeParams, DEFAULT_PARAMS } from '../src/params.js';

describe('interlock-full dropdown', () => {
  it('FIELDS.cornerMode offers clear, interlock, interlock-full', () => {
    expect(FIELDS.cornerMode.options).toEqual(['clear', 'interlock', 'interlock-full']);
    expect(FIELDS.cornerMode.hint).toMatch(/full|fold/i);
  });
  it('the control renders the interlock-full option', () => {
    const { el } = buildControlPanel({ params: { ...DEFAULT_PARAMS } });
    const opts = [...el.querySelector('select[data-key="cornerMode"]').querySelectorAll('option')].map((o) => o.value);
    expect(opts).toEqual(['clear', 'interlock', 'interlock-full']);
  });
  it('normalizeParams passes interlock-full through unchanged', () => {
    expect(normalizeParams({ ...DEFAULT_PARAMS, cornerMode: 'interlock-full' }).cornerMode).toBe('interlock-full');
  });
});
