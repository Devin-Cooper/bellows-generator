import { describe, it, expect } from 'vitest';
import { computePageGrid, PAGE_SIZES } from '../src/ui/preview.js';

describe('computePageGrid', () => {
  it('exposes physical page sizes in mm', () => {
    expect(PAGE_SIZES.A4).toEqual({ w: 210, h: 297 });
  });

  it('tiles a 360x200 sheet onto A4 with 10mm overlap into 2 columns x 1 row', () => {
    const grid = computePageGrid({ w: 360, h: 200 }, 'A4', 10);
    // strideX = 210 - 10 = 200 -> ceil((360-10)/200) = 2 cols
    // strideY = 297 - 10 = 287 -> ceil((200-10)/287) = 1 row
    expect(grid.cols).toBe(2);
    expect(grid.rows).toBe(1);
    expect(grid.count).toBe(2);
    expect(grid.overlap).toBe(10);
    expect(grid.tiles.map((t) => [t.page, t.x, t.y])).toEqual([
      [1, 0, 0],
      [2, 200, 0],
    ]);
    expect(grid.tiles[0]).toMatchObject({ w: 210, h: 297, col: 0, row: 0 });
  });

  it('always emits at least one tile for a tiny sheet', () => {
    const grid = computePageGrid({ w: 5, h: 5 }, 'A4', 10);
    expect(grid.count).toBe(1);
    expect(grid.tiles[0].page).toBe(1);
  });

  it('falls back to A4 for an unknown page size', () => {
    const grid = computePageGrid({ w: 5, h: 5 }, 'Foolscap');
    expect(grid.pageSize).toBe('A4');
    expect(grid.tiles[0]).toMatchObject({ w: 210, h: 297 });
  });
});
