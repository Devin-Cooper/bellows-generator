export { PAGE_SIZES } from '../tiling.js';
import { planTiles, TILE_MARGIN_MM } from '../tiling.js';

/**
 * Lay printable page tiles over the flat sheet using the canonical two-sided-margin
 * model (stride = pageDim - 2*TILE_MARGIN_MM per axis). Delegates to planTiles so
 * the on-screen page overlay always agrees with the PDF exporter.
 *
 * The `overlap` parameter is kept for signature back-compatibility but is ignored;
 * the returned `overlap` field is always TILE_MARGIN_MM (10 mm).
 */
export function computePageGrid(bounds, pageSize, overlap = 10) {  // eslint-disable-line no-unused-vars
  const plan = planTiles(bounds, pageSize);
  return {
    pageSize: plan.pageSize,
    overlap: TILE_MARGIN_MM,
    cols: plan.cols,
    rows: plan.rows,
    count: plan.count,
    tiles: plan.tiles,
  };
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

function composePreview(opts, state) {
  const overlay = state.showGrid
    ? `<svg class="preview-overlay" xmlns="http://www.w3.org/2000/svg" ` +
      `xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" ` +
      `width="${fmt(opts.bounds.w)}mm" height="${fmt(opts.bounds.h)}mm" ` +
      `viewBox="0 0 ${fmt(opts.bounds.w)} ${fmt(opts.bounds.h)}" ` +
      `style="position:absolute;left:0;top:0;pointer-events:none;">\n${renderPageGridSVG(opts.grid)}\n</svg>`
    : '';
  return (
    `<style>${layerVisibilityCSS(state.hidden)}</style>` +
    `<div class="preview-stage" style="position:relative;transform-origin:top left;` +
    `transform:${previewTransform(state)};">` +
    opts.patternSVG +
    overlay +
    `</div>`
  );
}

/** Mount a live flat preview: pattern SVG + page-grid overlay, with zoom/pan + layer toggles. */
export function mountPreview(container, options) {
  const { patternSVG, model, params } = options;
  const bounds = model.bounds;
  const grid = computePageGrid(bounds, params.pageSize, options.overlap ?? 10);
  const opts = { patternSVG, bounds, grid };
  const state = { zoom: 1, panX: 0, panY: 0, hidden: new Set(), showGrid: true };
  const ac = new AbortController();
  const render = () => {
    container.innerHTML = composePreview(opts, state);
  };

  container.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    state.zoom = Math.max(0.1, Math.min(20, state.zoom * factor));
    render();
  }, { signal: ac.signal });
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  container.addEventListener('mousedown', (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  }, { signal: ac.signal });
  container.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    state.panX += e.clientX - lastX;
    state.panY += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    render();
  }, { signal: ac.signal });
  container.addEventListener('mouseup', () => {
    dragging = false;
  }, { signal: ac.signal });

  render();

  return {
    setZoom(z) {
      state.zoom = z;
      render();
    },
    setPan(x, y) {
      state.panX = x;
      state.panY = y;
      render();
    },
    toggleLayer(type) {
      if (state.hidden.has(type)) state.hidden.delete(type);
      else state.hidden.add(type);
      render();
    },
    setGridVisible(v) {
      state.showGrid = v;
      render();
    },
    getState() {
      return {
        zoom: state.zoom,
        panX: state.panX,
        panY: state.panY,
        hidden: [...state.hidden],
        showGrid: state.showGrid,
      };
    },
    destroy() {
      ac.abort();
      container.innerHTML = '';
    },
  };
}
