// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildControlPanel } from '../src/ui/controls.js';
import { DEFAULT_PARAMS } from '../src/params.js';

vi.mock('../src/render/three.js', () => ({
  mountPreview: vi.fn((container, mountOpts) => {
    container.innerHTML = mountOpts.patternSVG;
    return { toggleLayer: vi.fn(), setGridVisible: vi.fn(), resetView: vi.fn(), getState: vi.fn(() => null), destroy: vi.fn() };
  }),
  buildPreviewToolbar: vi.fn(() => document.createElement('div')),
  BellowsViewer: vi.fn(() => ({ resize: vi.fn(), destroy: vi.fn() })),
}));
const downloadBlob = vi.fn();
vi.mock('../src/export/download.js', () => ({
  makeSVGBlob: vi.fn((svg) => svg),      // passthrough so downloadBlob's 1st arg is the raw SVG string
  downloadBlob: (...a) => downloadBlob(...a),
  triggerDownload: vi.fn(),
  downloadPatternSheets: vi.fn(),
}));
vi.mock('../src/export/stl.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, exportRibsSTL: vi.fn(() => new ArrayBuffer(12)), exportFullRibsSTL: vi.fn(() => new ArrayBuffer(12)) };
});

import { initApp } from '../src/ui/state.js';

describe('cut-only export UI', () => {
  it('renders a "Rib SVG (cut only)" export button with kind svg-ribs-cut', () => {
    const { el } = buildControlPanel({ params: { ...DEFAULT_PARAMS } });
    const btn = el.querySelector('[data-export="svg-ribs-cut"]');
    expect(btn).not.toBeNull();
    expect(btn.textContent).toBe('Rib SVG (cut only)');
  });

  it('the button fires onExport with svg-ribs-cut', () => {
    const onExport = vi.fn();
    const { el } = buildControlPanel({ params: { ...DEFAULT_PARAMS }, onExport });
    el.querySelector('[data-export="svg-ribs-cut"]').click();
    expect(onExport).toHaveBeenCalledWith('svg-ribs-cut');
  });

  describe('state wiring', () => {
    beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); window.history.replaceState(null, '', '/bellows-generator/'); downloadBlob.mockClear(); });
    afterEach(() => vi.clearAllMocks());

    it('clicking the cut-only button downloads cut-only sheets named bellows-ribs-cut-sheet-N.svg', () => {
      const root = document.createElement('div');
      document.body.appendChild(root);
      initApp(root);
      root.querySelector('[data-export="svg-ribs-cut"]').click();
      const cutCalls = downloadBlob.mock.calls.filter((c) => /bellows-ribs-cut-sheet-\d+\.svg/.test(c[1]));
      expect(cutCalls.length).toBeGreaterThan(0);
      for (const [svg] of cutCalls) {
        expect(svg).toContain('inkscape:label="CUT"');
        expect(svg).not.toContain('FOLD_VALLEY'); // proves cutOnly:true reached the renderer
      }
    });
  });
});
