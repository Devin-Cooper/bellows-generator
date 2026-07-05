import { describe, it, expect } from 'vitest';
import { computePageGrid, renderPageGridSVG, previewTransform, layerVisibilityCSS, mountPreview } from '../src/ui/preview.js';

describe('computePageGrid (bed-sheet grid)', () => {
  it('tiles a 900x300 sheet onto a 400x400 bed into 3 columns x 1 row', () => {
    const grid = computePageGrid({ w: 900, h: 300 }, 400, 400);
    expect(grid.cols).toBe(3);
    expect(grid.rows).toBe(1);
    expect(grid.count).toBe(3);
    expect(grid.bedW).toBe(400);
    expect(grid.tiles.map((t) => [t.page, t.x, t.y])).toEqual([
      [1, 0, 0],
      [2, 400, 0],
      [3, 800, 0],
    ]);
    expect(grid.tiles[0]).toMatchObject({ w: 400, h: 300, col: 0, row: 0 });
    expect(grid.tiles[2].w).toBeCloseTo(100, 6); // remainder column clipped
  });

  it('always emits at least one sheet for a tiny pattern', () => {
    const grid = computePageGrid({ w: 5, h: 5 }, 609.6, 406.4);
    expect(grid.count).toBe(1);
    expect(grid.tiles[0].page).toBe(1);
  });
});

describe('renderPageGridSVG', () => {
  it('draws a dashed bed rect + Sheet label per cell and records the bed size', () => {
    const svg = renderPageGridSVG(computePageGrid({ w: 900, h: 300 }, 400, 400));
    expect((svg.match(/<rect /g) || []).length).toBe(3);
    expect(svg).toContain('>Sheet 1<');
    expect(svg).toContain('>Sheet 3<');
    expect(svg).toContain('stroke-dasharray');
    expect(svg).toContain('data-bed="400x400"');
    expect(svg).toContain('<rect x="400" y="0" width="400" height="300"');
  });
});

describe('preview view helpers', () => {
  it('builds a CSS transform from zoom/pan state', () => {
    expect(previewTransform({ zoom: 2, panX: 15, panY: -4 })).toBe(
      'translate(15px, -4px) scale(2)'
    );
  });

  it('hides only the requested layers via inkscape:label selectors', () => {
    const css = layerVisibilityCSS(['CUT', 'ENGRAVE']);
    expect(css).toContain('[inkscape\\:label="CUT"]{display:none}');
    expect(css).toContain('[inkscape\\:label="ENGRAVE"]{display:none}');
    expect(css).not.toContain('FOLD_MOUNTAIN');
  });

  it('emits nothing when no layers are hidden', () => {
    expect(layerVisibilityCSS([])).toBe('');
    expect(layerVisibilityCSS(new Set())).toBe('');
  });
});

/** Minimal container stub: mountPreview only ever touches innerHTML + addEventListener. */
function fakeContainer() {
  return { innerHTML: '', listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; } };
}

const previewOptions = () => ({
  patternSVG: '<svg id="pattern"><g inkscape:label="CUT"></g></svg>',
  model: { bounds: { w: 360, h: 200 } },
  params: { bedW: 609.6, bedH: 406.4 },
});

describe('mountPreview', () => {
  it('injects the pattern SVG and the bed-grid overlay on mount', () => {
    const el = fakeContainer();
    mountPreview(el, previewOptions());
    expect(el.innerHTML).toContain('<svg id="pattern">');
    expect(el.innerHTML).toContain('>Sheet 1<'); // 360x200 fits one 609.6x406.4 bed
    expect(el.innerHTML).toContain('scale(1)');
  });

  it('re-renders with a new transform when zoom/pan change', () => {
    const el = fakeContainer();
    const api = mountPreview(el, previewOptions());
    api.setZoom(2.5);
    api.setPan(30, -10);
    expect(el.innerHTML).toContain('translate(30px, -10px) scale(2.5)');
    expect(api.getState()).toMatchObject({ zoom: 2.5, panX: 30, panY: -10 });
  });

  it('toggles a layer off then on again', () => {
    const el = fakeContainer();
    const api = mountPreview(el, previewOptions());
    api.toggleLayer('CUT');
    expect(el.innerHTML).toContain('[inkscape\\:label="CUT"]{display:none}');
    expect(api.getState().hidden).toContain('CUT');
    api.toggleLayer('CUT');
    expect(el.innerHTML).not.toContain('display:none');
  });

  it('hides the bed grid when toggled off and clears on destroy', () => {
    const el = fakeContainer();
    const api = mountPreview(el, previewOptions());
    api.setGridVisible(false);
    expect(el.innerHTML).not.toContain('Sheet 1');
    api.destroy();
    expect(el.innerHTML).toBe('');
  });

  it('aborts all listener signals on destroy', () => {
    const signals = [];
    const el = {
      innerHTML: '',
      addEventListener(_type, _fn, opts) {
        if (opts?.signal) signals.push(opts.signal);
      },
    };
    const api = mountPreview(el, previewOptions());
    expect(signals.length).toBe(6);
    signals.forEach((s) => expect(s.aborted).toBe(false));
    api.destroy();
    signals.forEach((s) => expect(s.aborted).toBe(true));
  });
});
