import { LAYER, LAYER_COLORS } from '../constants.js';
import { computeRibShapes } from '../geometry/ribShapes.js';

const LAYER_ORDER = [
  LAYER.CUT,
  LAYER.FOLD_MOUNTAIN,
  LAYER.FOLD_VALLEY,
  LAYER.ENGRAVE,
  LAYER.GLUE_TAB,
];

// Only the outer CUT boundary is kerf-compensated.
// GLUE_TAB is a scored fold line, not a kerf-grown cut edge — the outer CUT rectangle
// already encloses the tab region, so GLUE_TAB must NOT pass through growRect.
const KERF_LAYERS = new Set([LAYER.CUT]);

const fmt = (n) => String(Math.round(n * 1e4) / 1e4);

/** Grow an axis-aligned polygon outward from its bbox centre by kerf/2 (no clipping lib needed). */
function growRect(points, kerf) {
  if (points.length < 3)
    throw new Error(`growRect expects an axis-aligned polygon (>=3 points), got ${points.length}`);
  const half = kerf / 2;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return points.map((p) => ({
    x: p.x < cx ? p.x - half : p.x > cx ? p.x + half : p.x,
    y: p.y < cy ? p.y - half : p.y > cy ? p.y + half : p.y,
  }));
}

function pathData(points, closed) {
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${fmt(p.x)} ${fmt(p.y)}`).join(' ');
  return closed ? `${d} Z` : d;
}

export function renderPatternSVG(model, params) {
  const { w, h } = model.bounds;

  const byType = new Map();
  for (const seg of model.segments) {
    if (!byType.has(seg.type)) byType.set(seg.type, []);
    byType.get(seg.type).push(seg);
  }

  const groups = [];
  for (const type of LAYER_ORDER) {
    const segs = byType.get(type);
    if (!segs || segs.length === 0) continue;
    const paths = segs
      .map((seg) => {
        const pts = KERF_LAYERS.has(type) ? growRect(seg.points, params.kerf) : seg.points;
        return `    <path d="${pathData(pts, seg.closed)}" />`;
      })
      .join('\n');
    groups.push(
      `  <g inkscape:groupmode="layer" inkscape:label="${type}" ` +
        `stroke="${LAYER_COLORS[type]}" fill="none">\n${paths}\n  </g>`
    );
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" ` +
    `width="${fmt(w)}mm" height="${fmt(h)}mm" viewBox="0 0 ${fmt(w)} ${fmt(h)}">\n` +
    groups.join('\n') +
    `\n</svg>`
  );
}

/**
 * Offset an axis-aligned polygon relative to its own bbox centre.
 * delta > 0 grows OUTWARD (laser kerf on an outer cut), delta < 0 shrinks INWARD
 * (kerf on an interior notch). No clipping library needed.
 */
function offsetFromCentre(points, delta) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return points.map((p) => ({
    x: p.x < cx ? p.x - delta : p.x > cx ? p.x + delta : p.x,
    y: p.y < cy ? p.y - delta : p.y > cy ? p.y + delta : p.y,
  }));
}

/** Ribs of one representative wall of a face, sorted rear->front by ribIndex. */
function faceColumnRibs(shapes, face) {
  const walls = [...new Set(shapes.filter((s) => s.face === face).map((s) => s.wallIndex))].sort(
    (a, b) => a - b
  );
  return shapes
    .filter((s) => s.face === face && s.wallIndex === walls[0])
    .sort((a, b) => a.ribIndex - b.ribIndex);
}

/**
 * Trace ONE connected ladder outline for a constant-width column and return its
 * multi-subpath d-string: outer boundary grown OUTWARD by kerf/2, plus one middle
 * notch per inter-rib gap shrunk INWARD by kerf/2. The notch stops tabW short of each
 * lateral end, so the left/right rails stay solid and every rib is held by two
 * connector tabs (the column cuts as one snap-apart piece — fixes P0).
 */
function traceColumn(width, colX0, datum, ribCount, params) {
  const { rib, gap, kerf } = params;
  const pit = rib + gap;
  const half = kerf / 2;
  const tabW = Math.min(2, params.cornerAllowance);
  const xL = colX0;
  const xR = colX0 + width;
  const yTop0 = datum;
  const yBotN = datum + (ribCount - 1) * pit + rib;

  const outer = [
    { x: xL, y: yTop0 },
    { x: xR, y: yTop0 },
    { x: xR, y: yBotN },
    { x: xL, y: yBotN },
  ];
  const subs = [pathData(offsetFromCentre(outer, half), true)];

  for (let i = 0; i < ribCount - 1; i++) {
    const gTop = datum + i * pit + rib; // bottom of rib i
    const gBot = datum + (i + 1) * pit; // top of rib i+1
    const nl = xL + tabW;
    const nr = xR - tabW;
    if (nr <= nl) continue; // rib narrower than two tabs: leave the gap solid (rare)
    const notch = [
      { x: nl, y: gTop },
      { x: nr, y: gTop },
      { x: nr, y: gBot },
      { x: nl, y: gBot },
    ];
    subs.push(pathData(offsetFromCentre(notch, -half), true));
  }
  return subs.join(' ');
}

/**
 * Stiffener rib-ladder SVG. Consumes the canonical rib shapes and emits ONE connected
 * CUT outline per column (outer boundary + per-gap middle notches) so the ribs stay
 * joined by ≤2 mm connector tabs and cut as a single snap-apart piece — no polygon-union
 * library. Kerf grows the outer boundary OUTWARD (parts come out at nominal width). Both
 * W and H families are emitted. cornerMode shapes the rib ends via computeRibShapes (clear
 * = rectangles here; pointed/alternating land in the corner-modes phase).
 * @param {import('../geometry/types.js').PatternModel} model
 * @param {object} params
 * @returns {string}
 */
export function renderRibLadderSVG(model, params) {
  const shapes = computeRibShapes(params);
  const { rib, gap, kerf } = params;
  const pit = rib + gap;
  const margin = 5;
  const gutter = 10;
  const datum = margin; // Phase 6 aligns this to the fabric endMargin datum

  const wRibs = faceColumnRibs(shapes, 'W');
  const hRibs = faceColumnRibs(shapes, 'H');
  const ribCount = wRibs.length;

  const sameWidths =
    wRibs.length === hRibs.length &&
    wRibs.every((r, i) => Math.abs(r.width - hRibs[i].width) < 1e-9);
  const columns = sameWidths
    ? [{ face: 'W', label: 'W/H', ribs: wRibs }]
    : [
        { face: 'W', label: 'W', ribs: wRibs },
        { face: 'H', label: 'H', ribs: hRibs },
      ];

  const cutPaths = [];
  const notes = [];
  let colX0 = margin + kerf / 2;
  let maxRight = 0;

  for (const col of columns) {
    const width = col.ribs[0].width; // constant per column for now; taper handled later
    const d = traceColumn(width, colX0, datum, col.ribs.length, params);
    cutPaths.push(
      `<path data-role="ladder" data-face="${col.face}" data-qty="2" fill-rule="evenodd" d="${d}"/>`
    );
    notes.push(
      `<text data-role="qty" data-face="${col.face}" ` +
        `x="${fmt(colX0)}" y="${fmt(datum - 1.5)}">${col.label} cut x2</text>`
    );
    maxRight = colX0 + width + kerf / 2;
    colX0 = colX0 + width + kerf + gutter;
  }

  const w = maxRight + margin;
  const h = datum + (ribCount - 1) * pit + rib + kerf / 2 + margin;
  const cut = LAYER.CUT;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" ` +
    `width="${fmt(w)}mm" height="${fmt(h)}mm" viewBox="0 0 ${fmt(w)} ${fmt(h)}">` +
    `<g inkscape:groupmode="layer" inkscape:label="${cut}" ` +
    `stroke="${LAYER_COLORS[cut]}" fill="none">` +
    cutPaths.join('') +
    `</g>` +
    `<g inkscape:groupmode="layer" inkscape:label="${LAYER.ENGRAVE}" ` +
    `stroke="${LAYER_COLORS[LAYER.ENGRAVE]}" fill="none">` +
    notes.join('') +
    `</g></svg>`
  );
}
