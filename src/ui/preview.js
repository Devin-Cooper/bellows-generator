export const PAGE_SIZES = {
  A4: { w: 210, h: 297 },
  A3: { w: 297, h: 420 },
  Letter: { w: 215.9, h: 279.4 },
};

/**
 * Lay printable page tiles over the flat sheet. Adjacent tiles overlap by `overlap`
 * mm, so each new tile advances by stride = pageDim - overlap.
 */
export function computePageGrid(bounds, pageSize, overlap = 10) {
  const key = pageSize in PAGE_SIZES ? pageSize : 'A4';
  const page = PAGE_SIZES[key];
  const strideX = page.w - overlap;
  const strideY = page.h - overlap;
  const cols = Math.max(1, Math.ceil((bounds.w - overlap) / strideX));
  const rows = Math.max(1, Math.ceil((bounds.h - overlap) / strideY));

  const tiles = [];
  let index = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      tiles.push({
        index,
        page: index + 1,
        col,
        row,
        x: col * strideX,
        y: row * strideY,
        w: page.w,
        h: page.h,
      });
      index++;
    }
  }

  return { pageSize: key, overlap, cols, rows, count: cols * rows, tiles };
}
