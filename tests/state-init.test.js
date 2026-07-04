// @vitest-environment jsdom
// tests/state-init.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/geometry/index.js', () => ({
  buildPatternModel: vi.fn(() => ({
    metrics: {
      flatPleatedLength: 360,
      usableDraw: 271,
      collapsedThickness: 22.5,
      ribCount: 25,
      magnification: 1.07,
      flatSheet: { w: 610, h: 430 },
      warnings: [],
    },
  })),
  buildFoldModel: vi.fn(() => ({ positions: [], indices: [], axialLength: 0, extension: 1 })),
}));
vi.mock('../src/render/svg.js', () => ({
  renderPatternSVG: vi.fn(() => '<svg data-mock="1"></svg>'),
}));
vi.mock('../src/render/three.js', () => ({
  BellowsViewer: vi.fn(function BellowsViewer() {
    this.setFoldModel = vi.fn();
    this.setExtension = vi.fn();
    this.dispose = vi.fn();
  }),
}));

import { initApp } from '../src/ui/state.js';
import { buildPatternModel, buildFoldModel } from '../src/geometry/index.js';
import { renderPatternSVG } from '../src/render/svg.js';
import { BellowsViewer } from '../src/render/three.js';

describe('initApp', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState(null, '', '/bellows-generator/?frontW=200');
    document.body.innerHTML = '';
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('hydrates params from the URL and renders both previews on load', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    initApp(root);
    expect(buildPatternModel).toHaveBeenCalledTimes(1);
    expect(buildPatternModel.mock.calls[0][0].frontW).toBe(200);
    expect(renderPatternSVG).toHaveBeenCalled();
    expect(buildFoldModel).toHaveBeenCalled();
    expect(BellowsViewer).toHaveBeenCalledTimes(1);
    expect(root.querySelector('.flat-preview').innerHTML).toContain('<svg');
  });

  it('debounced replaceState keeps the URL in sync after a param change', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const spy = vi.spyOn(window.history, 'replaceState');
    initApp(root);
    const input = root.querySelector('[data-key="maxDraw"]');
    input.value = '250';
    input.dispatchEvent(new Event('input'));
    vi.runAllTimers();
    expect(spy).toHaveBeenCalled();
    const url = spy.mock.calls.at(-1)[2];
    expect(url.startsWith('/bellows-generator/')).toBe(true);
    expect(url).toContain('maxDraw=250');
  });
});
