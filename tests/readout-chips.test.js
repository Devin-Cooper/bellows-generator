// @vitest-environment jsdom
// tests/readout-chips.test.js
import { describe, it, expect } from 'vitest';
import { buildControlPanel } from '../src/ui/controls.js';
import { DEFAULT_PARAMS } from '../src/params.js';

const metrics = (over = {}) => ({
  flatPleatedLength: 360,
  usableDraw: 271,
  collapsedThickness: 22.5,
  ribCount: 25,
  magnification: 1.07,
  flatSheet: { w: 610, h: 430 },
  warnings: [],
  ...over,
});

describe('read-out strip markup', () => {
  it('marks the .readouts container as an aria-live polite region', () => {
    const { el } = buildControlPanel({ params: { ...DEFAULT_PARAMS } });
    const strip = el.querySelector('.readouts');
    expect(strip).not.toBeNull();
    expect(strip.getAttribute('aria-live')).toBe('polite');
  });

  it('renders each row as a .readout-k / .readout-v pair', () => {
    const { el, setReadouts } = buildControlPanel({ params: { ...DEFAULT_PARAMS } });
    setReadouts(metrics({ collapsedThickness: 12 }));
    const first = el.querySelector('.readout');
    expect(first.querySelector('.readout-k')).not.toBeNull();
    expect(first.querySelector('.readout-v')).not.toBeNull();
    expect(first.querySelector('.readout-k').textContent).toBe('Flat pleated length');
    expect(first.querySelector('.readout-v').textContent).toBe('360.0 mm');
  });

  it('flags a >20mm collapse as a .readout.warn chip', () => {
    const { el, setReadouts } = buildControlPanel({ params: { ...DEFAULT_PARAMS } });
    setReadouts(metrics({ collapsedThickness: 22.5 }));
    const warnRow = el.querySelector('.readout.warn');
    expect(warnRow).not.toBeNull();
    expect(warnRow.querySelector('.readout-k').textContent).toBe('Collapsed thickness');
  });

  it('announces a kerf>=gap warning as a warn chip', () => {
    const { el, setReadouts } = buildControlPanel({ params: { ...DEFAULT_PARAMS } });
    setReadouts(metrics({ collapsedThickness: 12, warnings: ['kerf>=gap'] }));
    const warns = [...el.querySelectorAll('.readout.warn')];
    expect(warns.some((r) => r.querySelector('.readout-v').textContent.includes('kerf'))).toBe(true);
  });
});
