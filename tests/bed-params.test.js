// tests/bed-params.test.js
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { DEFAULT_PARAMS, A6_PRESET } from '../src/params.js';
import { FIELDS } from '../src/ui/fields.js';
import { computePageGrid, renderPageGridSVG } from '../src/ui/preview.js';

describe('laser-bed params replace the retired pageSize / A4 tiling', () => {
  it('DEFAULT_PARAMS carries bedW/bedH (24x16in = 609.6x406.4mm) and no pageSize', () => {
    expect(DEFAULT_PARAMS.bedW).toBe(609.6);
    expect(DEFAULT_PARAMS.bedH).toBe(406.4);
    expect(DEFAULT_PARAMS.pageSize).toBeUndefined();
    expect(A6_PRESET.bedW).toBe(609.6);
    expect(A6_PRESET.bedH).toBe(406.4);
  });

  it('FIELDS gains numeric bedW/bedH metadata and drops pageSize', () => {
    expect(FIELDS.bedW).toBeDefined();
    expect(FIELDS.bedH).toBeDefined();
    expect(FIELDS.bedW.unit).toBe('mm');
    expect(FIELDS.bedH.unit).toBe('mm');
    expect(FIELDS.bedW.kind).toBeUndefined(); // plain number input, not a select
    expect(FIELDS.pageSize).toBeUndefined();
  });

  it('the retired tiling + tiled-PDF modules are gone', async () => {
    const tilingPath = /* @vite-ignore */ '../src/tiling.js';
    const pdfPath = /* @vite-ignore */ '../src/export/pdf.js';
    await expect(import(/* @vite-ignore */ tilingPath)).rejects.toBeTruthy();
    await expect(import(/* @vite-ignore */ pdfPath)).rejects.toBeTruthy();
  });
});

describe('preview overlay: bed-sheet boundaries from bedW/bedH', () => {
  it('tiles the flat sheet into bedW x bedH cells (not A4 pages)', () => {
    // 900x300 flat over a 400x400 bed -> 3 cols x 1 row, last column clipped to 100mm.
    const grid = computePageGrid({ w: 900, h: 300 }, 400, 400);
    expect(grid.bedW).toBe(400);
    expect(grid.bedH).toBe(400);
    expect(grid.cols).toBe(3);
    expect(grid.rows).toBe(1);
    expect(grid.count).toBe(3);
    expect(grid.tiles.map((t) => [t.page, t.x, t.y])).toEqual([
      [1, 0, 0],
      [2, 400, 0],
      [3, 800, 0],
    ]);
    expect(grid.tiles[2].w).toBeCloseTo(100, 6); // remainder column clipped to the sheet
    expect(grid.tiles[0].h).toBeCloseTo(300, 6);
  });

  it('always emits at least one sheet for a tiny pattern', () => {
    const grid = computePageGrid({ w: 5, h: 5 }, 609.6, 406.4);
    expect(grid.count).toBe(1);
    expect(grid.tiles[0].page).toBe(1);
  });

  it('renderPageGridSVG draws one dashed bed rect + Sheet label per cell', () => {
    const svg = renderPageGridSVG(computePageGrid({ w: 900, h: 300 }, 400, 400));
    expect((svg.match(/<rect /g) || []).length).toBe(3);
    expect(svg).toContain('>Sheet 1<');
    expect(svg).toContain('>Sheet 3<');
    expect(svg).toContain('stroke-dasharray');
    expect(svg).toContain('data-bed="400x400"');
    expect(svg).toContain('<rect x="400" y="0" width="400" height="300"');
  });
});
