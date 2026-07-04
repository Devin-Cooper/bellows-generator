// @vitest-environment jsdom
// tests/controls-panel.test.js
import { describe, it, expect, vi } from 'vitest';
import { buildControlPanel } from '../src/ui/controls.js';
import { DEFAULT_PARAMS, A6_PRESET } from '../src/params.js';

describe('buildControlPanel', () => {
  it('renders the grouped fieldsets', () => {
    const { el } = buildControlPanel({ params: { ...DEFAULT_PARAMS } });
    const legends = [...el.querySelectorAll('legend')].map((l) => l.textContent);
    expect(legends).toEqual(
      expect.arrayContaining([
        'Type',
        'Openings',
        'Draw & pleats',
        'Corners, tabs & margins',
        'Material & laser',
        'Optics',
        'Export',
      ]),
    );
  });

  it('locks rear openings to front while straight', () => {
    const onChange = vi.fn();
    const { el } = buildControlPanel({
      params: { ...DEFAULT_PARAMS, type: 'straight' },
      onChange,
    });
    const frontW = el.querySelector('[data-key="frontW"]');
    const rearW = el.querySelector('[data-key="rearW"]');
    expect(rearW.disabled).toBe(true);
    frontW.value = '200';
    frontW.dispatchEvent(new Event('input'));
    const last = onChange.mock.calls.at(-1)[0];
    expect(last.frontW).toBe(200);
    expect(last.rearW).toBe(200);
  });

  it('A6 preset button applies the A6 opening dimensions', () => {
    const onChange = vi.fn();
    const { el } = buildControlPanel({ params: { ...DEFAULT_PARAMS }, onChange });
    el.querySelector('[data-preset="A6"]').dispatchEvent(new Event('click'));
    const last = onChange.mock.calls.at(-1)[0];
    expect(last.frontW).toBe(A6_PRESET.frontW);
    expect(last.frontH).toBe(A6_PRESET.frontH);
  });

  it('setReadouts renders the derived strip with a warn class', () => {
    const { el, setReadouts } = buildControlPanel({ params: { ...DEFAULT_PARAMS } });
    setReadouts({
      flatPleatedLength: 360,
      usableDraw: 271,
      collapsedThickness: 22.5,
      ribCount: 25,
      magnification: 1.07,
      flatSheet: { w: 610, h: 430 },
      warnings: [],
    });
    expect(el.querySelectorAll('.readout').length).toBe(6);
    expect(el.querySelector('.readout.warn')).not.toBeNull();
  });

  it('a single input event on a number field fires onChange exactly once', () => {
    const onChange = vi.fn();
    const { el } = buildControlPanel({ params: { ...DEFAULT_PARAMS }, onChange });
    const frontW = el.querySelector('[data-key="frontW"]');
    frontW.dispatchEvent(new Event('input'));
    expect(onChange.mock.calls.length).toBe(1);
  });

  it('submit event on the form is prevented', () => {
    const { el } = buildControlPanel({ params: { ...DEFAULT_PARAMS } });
    const prevented = !el.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(prevented).toBe(true);
  });

  it('changing maxDraw keeps ribCount null (auto) in onChange payload — not pinned to initial value', () => {
    const onChange = vi.fn();
    const { el } = buildControlPanel({ params: { ...DEFAULT_PARAMS }, onChange });
    const maxDraw = el.querySelector('[data-key="maxDraw"]');
    maxDraw.value = '450';
    maxDraw.dispatchEvent(new Event('input'));
    const last = onChange.mock.calls.at(-1)[0];
    expect(last.ribCount).toBeNull();
  });

  it('renders each control as a .field with a human label, unit chip, and hint subtext', () => {
    const { el } = buildControlPanel({ params: { ...DEFAULT_PARAMS } });
    const frontW = el.querySelector('[data-key="frontW"]');
    const field = frontW.closest('.field');
    expect(field).not.toBeNull();
    const label = field.querySelector('.field-label');
    expect(label.textContent).toContain('Front width');
    expect(field.querySelector('.field-unit').textContent).toBe('mm');
    expect(field.querySelector('.hint').textContent).toContain('front');
  });

  it('omits the unit chip for unitless fields but keeps the hint', () => {
    const { el } = buildControlPanel({ params: { ...DEFAULT_PARAMS } });
    const typeField = el.querySelector('[data-key="type"]').closest('.field');
    expect(typeField.querySelector('.field-unit')).toBeNull();
    expect(typeField.querySelector('.field-label').textContent).toContain('Bellows type');
    expect(typeField.querySelector('.hint')).not.toBeNull();
  });

  it('reveals hints via the .hints-on class and setHintsOn toggles it', () => {
    const { el, setHintsOn } = buildControlPanel({ params: { ...DEFAULT_PARAMS } });
    setHintsOn(false);
    expect(el.classList.contains('hints-on')).toBe(false);
    setHintsOn(true);
    expect(el.classList.contains('hints-on')).toBe(true);
  });

  it('export buttons carry friendly labels while keeping data-export kinds', () => {
    const { el } = buildControlPanel({ params: { ...DEFAULT_PARAMS } });
    const byKind = Object.fromEntries(
      [...el.querySelectorAll('[data-export]')].map((b) => [b.dataset.export, b.textContent]),
    );
    expect(byKind).toEqual({
      svg: 'Fold-pattern SVG',
      'svg-ribs': 'Rib-ladder SVG',
      pdf: 'Tiled PDF',
      stl: 'Rib STL',
    });
  });

  it('setReadouts emits .readout rows with .readout-k / .readout-v cells', () => {
    const { el, setReadouts } = buildControlPanel({ params: { ...DEFAULT_PARAMS } });
    setReadouts({
      flatPleatedLength: 360,
      usableDraw: 271,
      collapsedThickness: 12,
      ribCount: 25,
      magnification: 1.07,
      flatSheet: { w: 610, h: 430 },
      warnings: [],
    });
    const first = el.querySelector('.readout');
    expect(first.querySelector('.readout-k')).not.toBeNull();
    expect(first.querySelector('.readout-v')).not.toBeNull();
  });
});
