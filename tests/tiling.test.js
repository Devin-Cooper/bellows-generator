import { describe, it, expect } from 'vitest';
import { planTiles, PAGE_SIZES, TILE_MARGIN_MM } from '../src/tiling.js';

describe('planTiles — canonical two-sided-margin tiling helper', () => {
  it('TILE_MARGIN_MM is 10', () => {
    expect(TILE_MARGIN_MM).toBe(10);
  });

  it('exposes A4, A3, Letter page sizes in mm', () => {
    expect(PAGE_SIZES.A4).toEqual({ w: 210, h: 297 });
    expect(PAGE_SIZES.A3).toEqual({ w: 297, h: 420 });
    expect(PAGE_SIZES.Letter).toEqual({ w: 215.9, h: 279.4 });
  });

  it('A4 stride is 190 x 277 mm (page - 2*margin)', () => {
    const plan = planTiles({ w: 1, h: 1 }, 'A4');
    // 210 - 2*10 = 190; 297 - 2*10 = 277
    expect(plan.stepX).toBe(190);
    expect(plan.stepY).toBe(277);
  });

  it('1000x1000 on A4 → 6 cols × 4 rows = 24 tiles', () => {
    // cols = ceil(1000/190) = ceil(5.263) = 6
    // rows = ceil(1000/277) = ceil(3.610) = 4
    const plan = planTiles({ w: 1000, h: 1000 }, 'A4');
    expect(plan.cols).toBe(6);
    expect(plan.rows).toBe(4);
    expect(plan.count).toBe(24);
    expect(plan.tiles.length).toBe(24);
  });

  it('360x200 on A4 → 2 cols × 1 row, tile positions at x=0 and x=190', () => {
    // cols = ceil(360/190) = ceil(1.894) = 2
    // rows = ceil(200/277) = ceil(0.722) = 1
    const plan = planTiles({ w: 360, h: 200 }, 'A4');
    expect(plan.cols).toBe(2);
    expect(plan.rows).toBe(1);
    expect(plan.count).toBe(2);
    expect(plan.tiles.map((t) => [t.page, t.x, t.y])).toEqual([
      [1, 0, 0],
      [2, 190, 0],
    ]);
    expect(plan.tiles[0]).toMatchObject({ w: 190, h: 277, col: 0, row: 0, index: 0 });
    expect(plan.tiles[1]).toMatchObject({ w: 190, h: 277, col: 1, row: 0, index: 1 });
  });

  it('always returns at least 1 tile for a tiny sheet', () => {
    const plan = planTiles({ w: 5, h: 5 }, 'A4');
    expect(plan.count).toBe(1);
    expect(plan.tiles[0].page).toBe(1);
  });

  it('falls back to A4 for an unknown page size', () => {
    const plan = planTiles({ w: 100, h: 100 }, 'Foolscap');
    expect(plan.pageSize).toBe('A4');
    expect(plan.stepX).toBe(190);
  });

  it('returns marginMm equal to TILE_MARGIN_MM', () => {
    const plan = planTiles({ w: 100, h: 100 }, 'A4');
    expect(plan.marginMm).toBe(TILE_MARGIN_MM);
  });

  it('A3 stride is 277 x 400 mm', () => {
    // 297 - 2*10 = 277; 420 - 2*10 = 400
    const plan = planTiles({ w: 1, h: 1 }, 'A3');
    expect(plan.stepX).toBe(277);
    expect(plan.stepY).toBe(400);
  });
});
