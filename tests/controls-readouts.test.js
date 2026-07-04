// tests/controls-readouts.test.js
import { describe, it, expect } from 'vitest';
import { formatReadouts } from '../src/ui/controls.js';

const metrics = {
  N: 24,
  ribCount: 25,
  pitch: 14.5,
  flatPleatedLength: 360,
  usableDraw: 271,
  collapsedThickness: 22.5,
  flatSheet: { w: 610, h: 430 },
  magnification: 1.07,
  warnings: [],
};

describe('formatReadouts', () => {
  it('produces one row per derived read-out with mm-formatted values', () => {
    const rows = formatReadouts(metrics);
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(byLabel['Flat pleated length']).toBe('360.0 mm');
    expect(byLabel['Usable draw']).toBe('271.0 mm');
    expect(byLabel['Rib count']).toBe('25');
    expect(byLabel['Flat sheet']).toBe('610 × 430 mm');
  });

  it('labels magnification as an approximation', () => {
    const rows = formatReadouts(metrics);
    const mag = rows.find((r) => r.label.startsWith('Magnification'));
    expect(mag.label).toContain('approx');
    expect(mag.value).toBe('1.07×');
  });

  it('flags collapsed thickness over 20 mm with warn', () => {
    const warn = formatReadouts(metrics).find((r) => r.label === 'Collapsed thickness');
    expect(warn.warn).toBe(true);
    const ok = formatReadouts({ ...metrics, collapsedThickness: 12 })
      .find((r) => r.label === 'Collapsed thickness');
    expect(ok.warn).toBe(false);
  });
});
