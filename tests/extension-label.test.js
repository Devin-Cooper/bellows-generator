// @vitest-environment jsdom
// tests/extension-label.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/geometry/index.js', () => ({
  buildPatternModel: vi.fn(() => ({
    metrics: {
      flatPleatedLength: 360,
      usableDraw: 271,
      collapsedThickness: 12,
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
  renderRibLadderSVG: vi.fn(() => '<svg data-rib="1"></svg>'),
}));
vi.mock('../src/render/three.js', () => ({
  BellowsViewer: vi.fn(function BellowsViewer() {
    this.setFoldModel = vi.fn();
    this.setExtension = vi.fn();
    this.setWireframe = vi.fn();
    this.resize = vi.fn();
    this.dispose = vi.fn();
  }),
}));
vi.mock('../src/ui/preview.js', () => ({
  mountPreview: vi.fn((container, opts) => {
    container.innerHTML = opts.patternSVG;
    return { toggleLayer: vi.fn(), setGridVisible: vi.fn(), resetView: vi.fn(), destroy: vi.fn() };
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
vi.mock('../src/export/stl.js', () => ({
  exportRibsSTL: vi.fn(() => new ArrayBuffer(12)),
}));

import { initApp, formatExtensionLabel } from '../src/ui/state.js';

describe('formatExtensionLabel', () => {
  it('formats the slider fraction as a rounded percentage', () => {
    expect(formatExtensionLabel(1)).toBe('Extension 100%');
    expect(formatExtensionLabel(0.5)).toBe('Extension 50%');
    expect(formatExtensionLabel(0)).toBe('Extension 0%');
    expect(formatExtensionLabel(0.333)).toBe('Extension 33%');
  });
});

describe('collapse slider extension label', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/bellows-generator/');
    document.body.innerHTML = '';
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders a live extension label that starts at 100%', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    initApp(root);
    const label = root.querySelector('.extension-label');
    expect(label).not.toBeNull();
    expect(label.textContent).toBe('Extension 100%');
  });

  it('updates the label text on slider input', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    initApp(root);
    const slider = root.querySelector('input[type="range"]');
    slider.value = '0.5';
    slider.dispatchEvent(new Event('input'));
    expect(root.querySelector('.extension-label').textContent).toBe('Extension 50%');
  });
});
