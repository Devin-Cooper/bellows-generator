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

  it('appends a kerf>=gap warn row when that warning is present', () => {
    const rows = formatReadouts({ ...metrics, warnings: ['kerf>=gap'] });
    const kerfRow = rows.find((r) => r.warn && r.value.includes('kerf'));
    expect(kerfRow).toBeDefined();
    expect(kerfRow.warn).toBe(true);
    expect(kerfRow.label).toBe('Warning');
  });

  it('does not duplicate the >20mm collapse warning as a separate row', () => {
    const rows = formatReadouts({ ...metrics, warnings: ['>20mm collapse'] });
    const warningRows = rows.filter((r) => r.label === 'Warning');
    expect(warningRows.length).toBe(0);
  });

  it('omits the stiffened-opening rows when metrics lack the fields (back-compat)', () => {
    const labels = formatReadouts(metrics).map((r) => r.label);
    expect(labels.some((l) => l.startsWith('Stiffened opening'))).toBe(false);
    expect(labels).not.toContain('Corner gap (rib-to-rib)');
  });

  it('shows a single stiffened-opening row + corner gap when front == rear (straight)', () => {
    const rows = formatReadouts({
      ...metrics,
      stiffenedOpening: { front: { w: 96, h: 96 }, rear: { w: 96, h: 96 } },
      cornerGap: 4,
    });
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(byLabel['Stiffened opening']).toBe('96 × 96 mm');
    expect(byLabel['Corner gap (rib-to-rib)']).toBe('4.0 mm');
    expect(byLabel['Stiffened opening (front)']).toBeUndefined();
  });

  it('splits front/rear stiffened-opening rows when they differ (tapered)', () => {
    const rows = formatReadouts({
      ...metrics,
      stiffenedOpening: { front: { w: 96, h: 96 }, rear: { w: 56, h: 56 } },
      cornerGap: 4,
    });
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(byLabel['Stiffened opening (front)']).toBe('96 × 96 mm');
    expect(byLabel['Stiffened opening (rear)']).toBe('56 × 56 mm');
    expect(byLabel['Stiffened opening']).toBeUndefined();
  });

  it('flags a non-positive stiffened opening (corner allowance too large) with warn', () => {
    const row = formatReadouts({
      ...metrics,
      stiffenedOpening: { front: { w: -10, h: -10 }, rear: { w: -10, h: -10 } },
      cornerGap: 60,
    }).find((r) => r.label === 'Stiffened opening');
    expect(row.warn).toBe(true);
  });
});
