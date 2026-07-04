import { describe, it, expect } from 'vitest';
import { computePageGrid, PAGE_SIZES, renderPageGridSVG, previewTransform, layerVisibilityCSS, mountPreview } from '../src/ui/preview.js';

describe('computePageGrid', () => {
  it('exposes physical page sizes in mm', () => {
    expect(PAGE_SIZES.A4).toEqual({ w: 210, h: 297 });
  });

  it('tiles a 360x200 sheet onto A4 with 10mm margin into 2 columns x 1 row', () => {
    const grid = computePageGrid({ w: 360, h: 200 }, 'A4', 10);
    // Two-sided margin model: strideX = 210 - 2*10 = 190 -> ceil(360/190) = 2 cols
    //                         strideY = 297 - 2*10 = 277 -> ceil(200/277) = 1 row
    expect(grid.cols).toBe(2);
    expect(grid.rows).toBe(1);
    expect(grid.count).toBe(2);
    expect(grid.overlap).toBe(10);
    expect(grid.tiles.map((t) => [t.page, t.x, t.y])).toEqual([
      [1, 0, 0],
      [2, 190, 0],
    ]);
    expect(grid.tiles[0]).toMatchObject({ w: 190, h: 277, col: 0, row: 0 });
  });

  it('always emits at least one tile for a tiny sheet', () => {
    const grid = computePageGrid({ w: 5, h: 5 }, 'A4', 10);
    expect(grid.count).toBe(1);
    expect(grid.tiles[0].page).toBe(1);
  });

  it('falls back to A4 for an unknown page size', () => {
    const grid = computePageGrid({ w: 5, h: 5 }, 'Foolscap');
    expect(grid.pageSize).toBe('A4');
    expect(grid.tiles[0]).toMatchObject({ w: 190, h: 277 });
  });
});

describe('renderPageGridSVG', () => {
  it('draws a dashed boundary rect and page label per tile and records the overlap', () => {
    const grid = computePageGrid({ w: 360, h: 200 }, 'A4', 10);
    const svg = renderPageGridSVG(grid);
    // one <rect> per tile
    expect((svg.match(/<rect /g) || []).length).toBe(2);
    // page numbers rendered
    expect(svg).toContain('>Page 1<');
    expect(svg).toContain('>Page 2<');
    // dashed boundary + overlap metadata
    expect(svg).toContain('stroke-dasharray');
    expect(svg).toContain('data-overlap="10"');
    // second tile positioned at the stride (two-sided-margin model: stride = 190)
    expect(svg).toContain('<rect x="190" y="0" width="190" height="277"');
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
  params: { pageSize: 'A4' },
});

describe('mountPreview', () => {
  it('injects the pattern SVG and the page-grid overlay on mount', () => {
    const el = fakeContainer();
    mountPreview(el, previewOptions());
    expect(el.innerHTML).toContain('<svg id="pattern">');
    expect(el.innerHTML).toContain('>Page 1<');
    expect(el.innerHTML).toContain('>Page 2<');
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

  it('hides the page grid when toggled off and clears on destroy', () => {
    const el = fakeContainer();
    const api = mountPreview(el, previewOptions());
    api.setGridVisible(false);
    expect(el.innerHTML).not.toContain('Page 1');
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
    expect(signals.length).toBe(4);
    signals.forEach((s) => expect(s.aborted).toBe(false));
    api.destroy();
    signals.forEach((s) => expect(s.aborted).toBe(true));
  });
});
