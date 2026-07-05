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
    bounds: { w: 610, h: 430 },
  })),
  buildFoldModel: vi.fn(() => ({ positions: [], indices: [], axialLength: 0, extension: 1 })),
}));
vi.mock('../src/render/svg.js', () => ({
  renderPatternSVG: vi.fn(() => '<svg data-mock="1"></svg>'),
  renderPatternSheets: vi.fn(() => ['<svg data-mock="1"></svg>']),
  renderRibLadderSVG: vi.fn(() => '<svg data-rib="1"></svg>'),
  renderRibMasterSheets: vi.fn(() => ['<svg data-rib="1"></svg>']),
}));
vi.mock('../src/render/three.js', () => ({
  BellowsViewer: vi.fn(function BellowsViewer() {
    this.setFoldModel = vi.fn();
    this.setExtension = vi.fn();
    this.dispose = vi.fn();
  }),
}));
vi.mock('../src/ui/preview.js', () => ({
  mountPreview: vi.fn((container, opts) => {
    container.innerHTML = opts.patternSVG;
    return {
      toggleLayer: vi.fn(),
      setGridVisible: vi.fn(),
      resetView: vi.fn(),
      getState: vi.fn(() => null),
      destroy: vi.fn(),
    };
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
  downloadPatternSheets: vi.fn(),
  triggerDownload: vi.fn(),
}));
vi.mock('../src/export/stl.js', () => ({
  exportRibsSTL: vi.fn(() => new ArrayBuffer(12)),
  exportFullRibsSTL: vi.fn(() => new ArrayBuffer(12)),
}));

import { initApp } from '../src/ui/state.js';
import { buildPatternModel, buildFoldModel } from '../src/geometry/index.js';
import { renderPatternSVG, renderPatternSheets } from '../src/render/svg.js';
import { BellowsViewer } from '../src/render/three.js';
import { mountPreview } from '../src/ui/preview.js';
import { downloadBlob, downloadPatternSheets, triggerDownload } from '../src/export/download.js';

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

  it('collapse slider calls viewer.setExtension with the slider value', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    initApp(root);
    const viewer = BellowsViewer.mock.instances[0];
    const slider = root.querySelector('input[type="range"]');
    slider.value = '0.5';
    slider.dispatchEvent(new Event('input'));
    expect(viewer.setExtension).toHaveBeenCalledWith(0.5);
  });

  it('onExport svg exports the fold pattern as bed-sized master sheets', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    initApp(root);
    root.querySelector('[data-export="svg"]').click();
    expect(renderPatternSheets).toHaveBeenCalled();
    expect(downloadPatternSheets).toHaveBeenCalledTimes(1);
    // the bed-sheets array (from renderPatternSheets) is what gets downloaded
    expect(downloadPatternSheets.mock.calls[0][0]).toEqual(['<svg data-mock="1"></svg>']);
  });

  it('onExport svg-ribs downloads per-bed-sheet rib SVGs', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    initApp(root);
    root.querySelector('[data-export="svg-ribs"]').click();
    expect(downloadBlob).toHaveBeenCalled();
    expect(downloadBlob.mock.calls[0][1]).toBe('bellows-ribs-sheet-1.svg');
  });

  it('onExport stl triggers triggerDownload with the stl filename', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    initApp(root);
    root.querySelector('[data-export="stl"]').click();
    expect(triggerDownload).toHaveBeenCalled();
    expect(triggerDownload.mock.calls[0][1]).toBe('bellows-ribs.stl');
  });

  it('onExport stl-full triggers triggerDownload with the full-ribs stl filename', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    initApp(root);
    root.querySelector('[data-export="stl-full"]').click();
    expect(triggerDownload).toHaveBeenCalled();
    expect(triggerDownload.mock.calls[0][1]).toBe('bellows-ribs-full.stl');
  });

  it('slider uses fresh params immediately after a param change without waiting for debounce', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    initApp(root);
    const viewer = BellowsViewer.mock.instances[0];

    // Change a param — updates params = next immediately, queues a debounced recompute
    const input = root.querySelector('[data-key="maxDraw"]');
    input.value = '300';
    input.dispatchEvent(new Event('input'));

    // DO NOT run timers — the debounce has NOT fired, so viewer.params is still stale
    // without the fix in the slider handler

    // Move the slider immediately
    const slider = root.querySelector('input[type="range"]');
    slider.value = '0.5';
    slider.dispatchEvent(new Event('input'));

    // setExtension must have been called with the slider value
    expect(viewer.setExtension).toHaveBeenCalledWith(0.5);

    // viewer.params must already reflect the fresh param change (maxDraw=300)
    expect(viewer.params).toBeDefined();
    expect(viewer.params.maxDraw).toBe(300);
  });

  it('mountPreview is called on initial render and reuses destroy-before-remount on recompute', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    initApp(root);
    // Initial render: mountPreview called once
    expect(mountPreview).toHaveBeenCalledTimes(1);

    // Trigger a debounced recompute
    const input = root.querySelector('[data-key="maxDraw"]');
    input.value = '280';
    input.dispatchEvent(new Event('input'));
    vi.runAllTimers();

    // After recompute mountPreview is called again (destroy-before-remount)
    expect(mountPreview).toHaveBeenCalledTimes(2);
    // The first api's destroy was called before re-mounting
    const firstApi = mountPreview.mock.results[0].value;
    expect(firstApi.destroy).toHaveBeenCalledTimes(1);
  });
});
