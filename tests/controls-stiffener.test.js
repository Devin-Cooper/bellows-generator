// @vitest-environment jsdom
// tests/controls-stiffener.test.js
import { describe, it, expect, vi } from 'vitest';
import { buildControlPanel } from '../src/ui/controls.js';
import { DEFAULT_PARAMS } from '../src/params.js';
import { buildPatternModel } from '../src/geometry/index.js';
import { LAYER } from '../src/constants.js';

describe('control panel — stiffener params', () => {
  it('renders a cornerMode select offering clear + interlock in the Corners group', () => {
    const { el } = buildControlPanel({ params: { ...DEFAULT_PARAMS } });
    const sel = el.querySelector('select[data-key="cornerMode"]');
    expect(sel, 'cornerMode select not rendered').not.toBeNull();
    const opts = [...sel.querySelectorAll('option')].map((o) => o.value);
    expect(opts).toEqual(['clear', 'interlock']);
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

  it('changing the cornerMode select fires onChange with interlock', () => {
    const onChange = vi.fn();
    const { el } = buildControlPanel({ params: { ...DEFAULT_PARAMS }, onChange });
    const sel = el.querySelector('[data-key="cornerMode"]');
    sel.value = 'interlock';
    sel.dispatchEvent(new Event('change'));
    const last = onChange.mock.calls.at(-1)[0];
    expect(last.cornerMode).toBe('interlock');
  });

  it('cornerMode reaches the geometry: interlock footprints differ from clear', () => {
    const engrave = (m) => m.segments.filter((s) => s.layer === LAYER.ENGRAVE);
    const distinctXs = (s) => new Set(s.points.map((p) => Math.round(p.x * 1e4) / 1e4)).size;
    const clear = engrave(buildPatternModel({ ...DEFAULT_PARAMS, cornerMode: 'clear' }));
    const interlock = engrave(buildPatternModel({ ...DEFAULT_PARAMS, cornerMode: 'interlock' }));
    expect(clear.length).toBeGreaterThan(0);
    expect(interlock.length).toBeGreaterThan(0);
    // clear footprints are plain rectangles (2 rail x-values); interlock ends are convex
    // trapezoids whose reach/setback add distinct x-values (>2) — same 4 vertices, new shape.
    expect(clear.every((s) => s.points.length === 4 && distinctXs(s) === 2)).toBe(true);
    expect(interlock.some((s) => distinctXs(s) > 2)).toBe(true);
  });
});
