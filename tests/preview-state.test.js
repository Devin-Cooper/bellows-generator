// tests/preview-state.test.js
// Verifies that mountPreview seeds state from initialState and falls back to
// defaults when initialState is absent.
import { describe, it, expect } from 'vitest';
import { mountPreview } from '../src/ui/preview.js';

/** Minimal container stub — mountPreview only ever touches innerHTML + addEventListener. */
function fakeContainer() {
  return {
    innerHTML: '',
    listeners: {},
    addEventListener(type, fn) { this.listeners[type] = fn; },
  };
}

const baseOptions = () => ({
  patternSVG: '<svg id="pattern"><g inkscape:label="CUT"></g></svg>',
  model: { bounds: { w: 360, h: 200 } },
  params: { pageSize: 'A4' },
});

describe('mountPreview initialState seeding', () => {
  it('seeds zoom, panX, panY, showGrid and hidden from initialState', () => {
    const el = fakeContainer();
    const api = mountPreview(el, {
      ...baseOptions(),
      initialState: { hidden: ['CUT'], showGrid: false, zoom: 2, panX: 10, panY: -5 },
    });
    const state = api.getState();
    expect(state.zoom).toBe(2);
    expect(state.panX).toBe(10);
    expect(state.panY).toBe(-5);
    expect(state.showGrid).toBe(false);
    expect(state.hidden).toContain('CUT');
  });

  it('uses defaults when initialState is absent', () => {
    const el = fakeContainer();
    const api = mountPreview(el, baseOptions());
    const state = api.getState();
    expect(state.zoom).toBe(1);
    expect(state.panX).toBe(0);
    expect(state.panY).toBe(0);
    expect(state.showGrid).toBe(true);
    expect(state.hidden).toEqual([]);
  });

  it('falls back to defaults for any missing field in initialState', () => {
    const el = fakeContainer();
    const api = mountPreview(el, {
      ...baseOptions(),
      initialState: { zoom: 3 }, // only zoom provided
    });
    const state = api.getState();
    expect(state.zoom).toBe(3);
    expect(state.panX).toBe(0);
    expect(state.panY).toBe(0);
    expect(state.showGrid).toBe(true);
    expect(state.hidden).toEqual([]);
  });
});
