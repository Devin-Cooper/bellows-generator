// @vitest-environment jsdom
// tests/controls-stiffener.test.js
import { describe, it, expect, vi } from 'vitest';
import { buildControlPanel } from '../src/ui/controls.js';
import { DEFAULT_PARAMS } from '../src/params.js';
import { buildPatternModel } from '../src/geometry/index.js';
import { LAYER } from '../src/constants.js';

describe('control panel — stiffener params', () => {
  it('renders a cornerMode select with the three modes in the Corners group', () => {
    const { el } = buildControlPanel({ params: { ...DEFAULT_PARAMS } });
    const sel = el.querySelector('select[data-key="cornerMode"]');
    expect(sel, 'cornerMode select not rendered').not.toBeNull();
    const opts = [...sel.querySelectorAll('option')].map((o) => o.value);
    expect(opts).toEqual(['clear', 'pointed', 'alternating']);
    // lands in the Corners fieldset, not Material
    const legend = sel.closest('fieldset').querySelector('legend').textContent;
    expect(legend).toBe('Corners, tabs & margins');
  });

  it('renders bedSize and printOffset as number inputs in the Material group', () => {
    const { el } = buildControlPanel({ params: { ...DEFAULT_PARAMS } });
    const bed = el.querySelector('[data-key="bedSize"]');
    const off = el.querySelector('[data-key="printOffset"]');
    expect(bed, 'bedSize input not rendered').not.toBeNull();
    expect(off, 'printOffset input not rendered').not.toBeNull();
    expect(bed.tagName).toBe('INPUT');
    expect(bed.type).toBe('number');
    expect(off.step).toBe('0.1');
    expect(bed.closest('fieldset').querySelector('legend').textContent).toBe('Material & laser');
  });

  it('initial values reflect DEFAULT_PARAMS', () => {
    const { el } = buildControlPanel({ params: { ...DEFAULT_PARAMS } });
    expect(el.querySelector('[data-key="cornerMode"]').value).toBe('clear');
    expect(el.querySelector('[data-key="bedSize"]').value).toBe('220');
    expect(el.querySelector('[data-key="printOffset"]').value).toBe('0.1');
  });

  it('changing the cornerMode select fires onChange with the new mode', () => {
    const onChange = vi.fn();
    const { el } = buildControlPanel({ params: { ...DEFAULT_PARAMS }, onChange });
    const sel = el.querySelector('[data-key="cornerMode"]');
    sel.value = 'pointed';
    sel.dispatchEvent(new Event('change'));
    const last = onChange.mock.calls.at(-1)[0];
    expect(last.cornerMode).toBe('pointed');
  });

  it('cornerMode reaches the geometry: pointed footprints differ from clear', () => {
    const engrave = (m) => m.segments.filter((s) => s.layer === LAYER.ENGRAVE);
    const clear = engrave(buildPatternModel({ ...DEFAULT_PARAMS, cornerMode: 'clear' }));
    const pointed = engrave(buildPatternModel({ ...DEFAULT_PARAMS, cornerMode: 'pointed' }));
    expect(clear.length).toBeGreaterThan(0);
    expect(pointed.length).toBeGreaterThan(0);
    // clear footprints are plain rectangles; pointed beveled ends add vertices
    expect(clear.every((s) => s.points.length === 4)).toBe(true);
    expect(pointed.some((s) => s.points.length > 4)).toBe(true);
  });
});
