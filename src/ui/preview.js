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

const fmt = (n) => String(Math.round(n * 1e4) / 1e4);

/** SVG <g> overlay (mm coords) marking PDF page tiles with numbers + overlap metadata. */
export function renderPageGridSVG(grid) {
  const rects = grid.tiles
    .map(
      (t) =>
        `    <rect x="${fmt(t.x)}" y="${fmt(t.y)}" width="${fmt(t.w)}" height="${fmt(t.h)}" ` +
        `fill="none" stroke="#8888ff" stroke-width="0.5" stroke-dasharray="4 2" />\n` +
        `    <text x="${fmt(t.x + 4)}" y="${fmt(t.y + 10)}" font-size="8" fill="#8888ff">Page ${t.page}</text>`
    )
    .join('\n');
  return (
    `  <g inkscape:groupmode="layer" inkscape:label="PAGE_GRID" data-overlap="${fmt(grid.overlap)}">\n` +
    `${rects}\n  </g>`
  );
}

/** CSS transform string for the zoom/pan stage (transform-origin: top left). */
export function previewTransform(state) {
  return `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
}

/** CSS that hides the given layer types by their inkscape:label attribute. */
export function layerVisibilityCSS(hidden) {
  const types = Array.from(hidden);
  if (types.length === 0) return '';
  return types.map((t) => `[inkscape\\:label="${t}"]{display:none}`).join('');
}
