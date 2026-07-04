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

/** Mount a live flat preview: pattern SVG + page-grid overlay, with pointer pan/pinch + layer toggles. */
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
  const clamp = (z) => Math.max(0.1, Math.min(20, z));
  const resetView = () => {
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;
    render();
  };

  const pointers = new Map(); // pointerId -> { x, y }
  const downAt = new Map(); // pointerId -> { x, y } at pointerdown (drag-vs-tap)
  let prevDist = 0; // last two-pointer distance
  let lastTap = null; // { t, x, y } for double-tap detection
  const rectOf = () =>
    container.getBoundingClientRect ? container.getBoundingClientRect() : { left: 0, top: 0 };

  // Wheel zoom (desktop) — unchanged behaviour.
  container.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      state.zoom = clamp(state.zoom * factor);
      render();
    },
    { signal: ac.signal }
  );

  container.addEventListener(
    'pointerdown',
    (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      downAt.set(e.pointerId, { x: e.clientX, y: e.clientY });
      container.setPointerCapture?.(e.pointerId);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        prevDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
    },
    { signal: ac.signal }
  );

  container.addEventListener(
    'pointermove',
    (e) => {
      if (!pointers.has(e.pointerId)) return;
      const prev = pointers.get(e.pointerId);
      if (pointers.size === 1) {
        state.panX += e.clientX - prev.x;
        state.panY += e.clientY - prev.y;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        render();
      } else if (pointers.size === 2) {
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (prevDist > 0) {
          const rect = rectOf();
          const mx = (a.x + b.x) / 2 - rect.left;
          const my = (a.y + b.y) / 2 - rect.top;
          const next = clamp(state.zoom * (dist / prevDist));
          const applied = next / state.zoom; // actual ratio after clamping
          state.panX = mx - (mx - state.panX) * applied;
          state.panY = my - (my - state.panY) * applied;
          state.zoom = next;
          render();
        }
        prevDist = dist;
      }
    },
    { signal: ac.signal }
  );

  const endPointer = (e, allowTap) => {
    const start = downAt.get(e.pointerId);
    pointers.delete(e.pointerId);
    downAt.delete(e.pointerId);
    prevDist = 0; // re-seed pinch tracking when a finger lifts
    if (!allowTap) return;
    const moved = start ? Math.hypot(e.clientX - start.x, e.clientY - start.y) : Infinity;
    if (moved >= 6) return; // a drag, not a tap
    const now = e.timeStamp ?? Date.now();
    if (
      lastTap &&
      now - lastTap.t < 300 &&
      Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30
    ) {
      lastTap = null;
      resetView();
    } else {
      lastTap = { t: now, x: e.clientX, y: e.clientY };
    }
  };

  container.addEventListener('pointerup', (e) => endPointer(e, true), { signal: ac.signal });
  container.addEventListener('pointercancel', (e) => endPointer(e, false), { signal: ac.signal });
  container.addEventListener('dblclick', () => resetView(), { signal: ac.signal });

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
    resetView,
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

/**
 * Build a styled preview toolbar wired to a mountPreview api: one .toggle per
 * layer, a page-grid .toggle, and a .btn reset. Returned element is mounted by
 * state.js/appShell under the active flat preview.
 */
export function buildPreviewToolbar(api, options = {}) {
  const layers = options.layers ?? [];
  const bar = document.createElement('div');
  bar.className = 'preview-toolbar';

  for (const { type, label } of layers) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toggle';
    btn.dataset.layer = type;
    btn.setAttribute('aria-pressed', 'true');
    btn.textContent = label;
    btn.addEventListener('click', () => {
      const on = btn.getAttribute('aria-pressed') === 'true';
      btn.setAttribute('aria-pressed', on ? 'false' : 'true');
      api.toggleLayer(type);
    });
    bar.appendChild(btn);
  }

  const gridBtn = document.createElement('button');
  gridBtn.type = 'button';
  gridBtn.className = 'toggle';
  gridBtn.dataset.grid = 'page';
  gridBtn.setAttribute('aria-pressed', String(options.showGrid ?? true));
  gridBtn.textContent = 'Page grid';
  gridBtn.addEventListener('click', () => {
    const on = gridBtn.getAttribute('aria-pressed') === 'true';
    gridBtn.setAttribute('aria-pressed', on ? 'false' : 'true');
    api.setGridVisible(!on);
  });
  bar.appendChild(gridBtn);

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'btn';
  resetBtn.dataset.action = 'reset-view';
  resetBtn.textContent = 'Reset view';
  resetBtn.addEventListener('click', () => api.resetView());
  bar.appendChild(resetBtn);

  return bar;
}
