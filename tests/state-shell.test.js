// @vitest-environment jsdom
// tests/state-shell.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/geometry/index.js', () => ({
  buildPatternModel: vi.fn(() => ({
    metrics: {
      flatPleatedLength: 360, usableDraw: 271, collapsedThickness: 12,
      ribCount: 25, magnification: 1.07, flatSheet: { w: 610, h: 430 }, warnings: [],
    },
    bounds: { w: 610, h: 430 },
  })),
  buildFoldModel: vi.fn(() => ({ positions: [], indices: [], axialLength: 0, extension: 1 })),
}));
vi.mock('../src/render/svg.js', () => ({
  renderPatternSVG: vi.fn(() => '<svg data-mock="1"></svg>'),
  renderRibLadderSVG: vi.fn(() => '<svg data-rib="1"></svg>'),
}));
vi.mock('../src/render/three.js', () => ({
  BellowsViewer: vi.fn(function BellowsViewer() {
    this.setFoldModel = vi.fn();
    this.setExtension = vi.fn();
    this.resize = vi.fn();
    this.dispose = vi.fn();
  }),
}));
vi.mock('../src/ui/controls.js', () => ({
  buildControlPanel: vi.fn((opts) => {
    const el = document.createElement('form');
    el.className = 'controls';
    const preset = document.createElement('button');
    preset.type = 'button';
    preset.dataset.preset = 'A6';
    preset.addEventListener('click', () => opts.onChange({ ...opts.params, frontW: 160 }));
    el.appendChild(preset);
    return { el, setReadouts: vi.fn(), setHintsOn: vi.fn() };
  }),
}));
vi.mock('../src/ui/preview.js', () => ({
  mountPreview: vi.fn((container, mountOpts) => {
    container.innerHTML = mountOpts.patternSVG;
    return { toggleLayer: vi.fn(), setGridVisible: vi.fn(), resetView: vi.fn(), getState: vi.fn(() => null), destroy: vi.fn() };
  }),
  buildPreviewToolbar: vi.fn(() => {
    const bar = document.createElement('div');
    bar.className = 'preview-toolbar';
    return bar;
  }),
}));
vi.mock('../src/export/download.js', () => ({
  makeSVGBlob: vi.fn((svg) => new Blob([svg], { type: 'image/svg+xml' })),
  downloadBlob: vi.fn(),
  triggerDownload: vi.fn(),
}));
vi.mock('../src/export/stl.js', () => ({ exportRibsSTL: vi.fn(() => new ArrayBuffer(12)) }));

import { initApp } from '../src/ui/state.js';
import { BellowsViewer } from '../src/render/three.js';
import { buildControlPanel } from '../src/ui/controls.js';

function panelInstance() {
  return buildControlPanel.mock.results.at(-1).value;
}

describe('initApp app-shell wiring', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState(null, '', '/bellows-generator/');
    document.body.innerHTML = '';
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('composes the app shell (header + tabs + segmented bar) and mounts the panel', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    initApp(root);
    expect(root.querySelector('.app-shell')).toBeTruthy();
    expect(root.querySelector('.app-header .app-title')).toBeTruthy();
    expect(root.querySelector('.preview-tabs')).toBeTruthy();
    expect(root.querySelector('.segmented-bar')).toBeTruthy();
    // Control panel mounted into the controls host
    expect(root.querySelector('.controls-host .controls')).toBeTruthy();
    // Flat preview rendered into svgHost
    expect(root.querySelector('.flat-preview').innerHTML).toContain('<svg');
  });

  it('calls viewer.resize when the 3D tab becomes active', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    initApp(root);
    const viewer = BellowsViewer.mock.instances[0];
    expect(viewer.resize).not.toHaveBeenCalled();
    root.querySelector('.tab-btn[data-view="3d"]').click();
    expect(viewer.resize).toHaveBeenCalledTimes(1);
  });

  it('debounced window resize calls viewer.resize', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    initApp(root);
    const viewer = BellowsViewer.mock.instances[0];
    window.dispatchEvent(new Event('resize'));
    expect(viewer.resize).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(viewer.resize).toHaveBeenCalledTimes(1);
  });

  it('applies default hints-on to both shell and panel on load', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    initApp(root);
    const panel = panelInstance();
    expect(panel.setHintsOn).toHaveBeenCalledWith(true);
    expect(root.querySelector('[data-role="hints-toggle"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('reads a persisted hints-off preference from localStorage on load', () => {
    localStorage.setItem('bellows.hintsOn', 'false');
    const root = document.createElement('div');
    document.body.appendChild(root);
    initApp(root);
    const panel = panelInstance();
    expect(panel.setHintsOn).toHaveBeenCalledWith(false);
    expect(root.querySelector('[data-role="hints-toggle"]').getAttribute('aria-pressed')).toBe('false');
  });

  it('toggling hints in the header persists to localStorage and updates the panel', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    initApp(root);
    const panel = panelInstance();
    root.querySelector('[data-role="hints-toggle"]').click();
    expect(localStorage.getItem('bellows.hintsOn')).toBe('false');
    expect(panel.setHintsOn).toHaveBeenLastCalledWith(false);
  });

  it('a header preset button reuses the control-panel preset path (re-renders)', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    initApp(root);
    const spy = vi.spyOn(window.history, 'replaceState');
    // Header preset button (first [data-preset="A6"] in DOM order is the header one)
    root.querySelector('.header-actions [data-preset="A6"]').click();
    vi.runAllTimers();
    expect(spy).toHaveBeenCalled();
    const url = spy.mock.calls.at(-1)[2];
    expect(url).toContain('frontW=160');
  });

  it('slider drives viewer.setExtension with the slider value', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    initApp(root);
    const viewer = BellowsViewer.mock.instances[0];
    const slider = root.querySelector('input[type="range"]');
    slider.value = '0.5';
    slider.dispatchEvent(new Event('input'));
    expect(viewer.setExtension).toHaveBeenCalledWith(0.5);
  });
});
