/**
 * Canonical page-tiling helper (all units: mm).
 *
 * Both the on-screen page-grid overlay (preview.js) and the PDF exporter
 * (export/pdf.js) delegate here so their pagination always agrees.
 *
 * Model: each page has a TILE_MARGIN_MM bleed margin on every side.
 * The content stride (step) is therefore pageDim - 2*margin per axis.
 * Tiles are positioned at col*stepX, row*stepY and sized stepX × stepY.
 */

export const PAGE_SIZES = {
  A4: { w: 210, h: 297 },
  A3: { w: 297, h: 420 },
  Letter: { w: 215.9, h: 279.4 },
};

/** Two-sided margin applied to every page edge (mm). */
export const TILE_MARGIN_MM = 10;

/**
 * Plan the page tiles that cover `bounds` (mm) for the given page size key.
 *
 * @param {{ w: number, h: number }} bounds  Flat-sheet dimensions in mm.
 * @param {string} pageSize                  Key from PAGE_SIZES; defaults to 'A4'.
 * @returns {{
 *   pageSize: string,
 *   page: { w: number, h: number },
 *   marginMm: number,
 *   stepX: number,
 *   stepY: number,
 *   cols: number,
 *   rows: number,
 *   count: number,
 *   tiles: Array<{ index:number, page:number, col:number, row:number,
 *                  x:number, y:number, w:number, h:number }>
 * }}
 */
export function planTiles(bounds, pageSize) {
  const key = pageSize in PAGE_SIZES ? pageSize : 'A4';
  const page = PAGE_SIZES[key];
  const stepX = page.w - 2 * TILE_MARGIN_MM;
  const stepY = page.h - 2 * TILE_MARGIN_MM;
  const cols = Math.max(1, Math.ceil(bounds.w / stepX));
  const rows = Math.max(1, Math.ceil(bounds.h / stepY));

  const tiles = [];
  let index = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      tiles.push({
        index,
        page: index + 1,
        col,
        row,
        x: col * stepX,
        y: row * stepY,
        w: stepX,
        h: stepY,
      });
      index++;
    }
  }

  return {
    pageSize: key,
    page,
    marginMm: TILE_MARGIN_MM,
    stepX,
    stepY,
    cols,
    rows,
    count: cols * rows,
    tiles,
  };
}
