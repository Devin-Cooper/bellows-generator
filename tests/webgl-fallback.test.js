// @vitest-environment jsdom
// tests/webgl-fallback.test.js —
// Verifies that initApp degrades gracefully when BellowsViewer throws (no WebGL),
// keeping the control panel and flat preview fully functional.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Default: BellowsViewer always throws (simulates no WebGL context).
vi.mock('../src/render/three.js', () => ({
  BellowsViewer: vi.fn(() => {
    throw new Error('Error creating WebGL context');
  }),
}));

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

vi.mock('../src/ui/preview.js', () => ({
  mountPreview: vi.fn((container, opts) => {
    container.innerHTML = opts.patternSVG;
    return {
      toggleLayer: vi.fn(),
      setGridVisible: vi.fn(),
      resetView: vi.fn(),
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
  triggerDownload: vi.fn(),
}));

vi.mock('../src/export/stl.js', () => ({
  exportRibsSTL: vi.fn(() => new ArrayBuffer(12)),
}));

import { initApp } from '../src/ui/state.js';
import { BellowsViewer } from '../src/render/three.js';
import { mountPreview } from '../src/ui/preview.js';

describe('WebGL fallback — graceful degradation when BellowsViewer throws', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState(null, '', '/bellows-generator/');
    document.body.innerHTML = '';
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('does not throw when BellowsViewer constructor throws', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    expect(() => initApp(root)).not.toThrow();
  });

  it('mounts the control panel into .controls-host even when WebGL is unavailable', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    initApp(root);
    const controlsHost = root.querySelector('.controls-host');
    expect(controlsHost).not.toBeNull();
    expect(controlsHost.children.length).toBeGreaterThan(0);
  });

  it('mounts the flat preview with SVG content even when WebGL is unavailable', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    initApp(root);
    expect(mountPreview).toHaveBeenCalled();
    const flatPreview = root.querySelector('.flat-preview');
    expect(flatPreview).not.toBeNull();
    expect(flatPreview.innerHTML).toContain('<svg');
  });

  it('shows a .preview-unavailable message inside the 3D panel', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    initApp(root);
    const threePanel = root.querySelector('.preview-panel[data-view="3d"]');
    expect(threePanel).not.toBeNull();
    const msg = threePanel.querySelector('.preview-unavailable');
    expect(msg).not.toBeNull();
    expect(msg.textContent).toContain('3D preview unavailable');
  });
});

describe('WebGL success path — no .preview-unavailable message when BellowsViewer succeeds', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState(null, '', '/bellows-generator/');
    document.body.innerHTML = '';
    // Override the throwing mock for these tests: BellowsViewer constructs normally.
    vi.mocked(BellowsViewer).mockImplementation(function () {
      this.setFoldModel = vi.fn();
      this.setExtension = vi.fn();
      this.resize = vi.fn();
      this.dispose = vi.fn();
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('does not render a .preview-unavailable message when WebGL is available', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    initApp(root);
    expect(root.querySelector('.preview-unavailable')).toBeNull();
  });
});
