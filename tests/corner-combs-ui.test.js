// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { buildControlPanel } from '../src/ui/controls.js';
import { DEFAULT_PARAMS } from '../src/params.js';

describe('corner-comb UI controls', () => {
  it('renders a checkbox + number in the Corners group, defaulting to off', () => {
    const { el } = buildControlPanel({ params: { ...DEFAULT_PARAMS } });
    const cb = el.querySelector('[data-key="cornerCombs"]');
    const tw = el.querySelector('[data-key="combToothWidth"]');
    expect(cb).not.toBeNull();
    expect(cb.type).toBe('checkbox');
    expect(cb.checked).toBe(false);
    expect(cb.closest('fieldset').querySelector('legend').textContent).toBe('Corners, tabs & margins');
    expect(tw.tagName).toBe('INPUT');
    expect(tw.type).toBe('number');
    expect(tw.value).toBe('5');
  });

  it('toggling the checkbox fires onChange with cornerCombs=true (boolean)', () => {
    const onChange = vi.fn();
    const { el } = buildControlPanel({ params: { ...DEFAULT_PARAMS }, onChange });
    const cb = el.querySelector('[data-key="cornerCombs"]');
    cb.checked = true;
    cb.dispatchEvent(new Event('change'));
    const last = onChange.mock.calls.at(-1)[0];
    expect(last.cornerCombs).toBe(true);
  });

  it('editing combToothWidth fires onChange with a clamped number', () => {
    const onChange = vi.fn();
    const { el } = buildControlPanel({ params: { ...DEFAULT_PARAMS }, onChange });
    const tw = el.querySelector('[data-key="combToothWidth"]');
    tw.value = '999';
    tw.dispatchEvent(new Event('input'));
    const last = onChange.mock.calls.at(-1)[0];
    expect(last.combToothWidth).toBe(DEFAULT_PARAMS.rib); // normalizeParams clamps to rib
  });
});
