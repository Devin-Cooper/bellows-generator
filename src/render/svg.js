import { LAYER, LAYER_COLORS } from '../constants.js';

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
 * Stiffener rib-ladder SVG. One column per unique face width (two widths for a
 * rectangular cross-section). Ribs are kerf-grown rectangles stacked at the
 * engine pitch so they self-align with the fabric fold lines. Each gap gets two
 * <=2mm connector tabs at the lateral rib ends (the corner clear zone); they
 * cross the transverse fold line and may be severed after bonding.
 * @param {import('../geometry/types.js').PatternModel} model
 * @param {object} params
 * @returns {string}
 */
export function renderRibLadderSVG(model, params) {
  const { ribCount, pitch } = model.metrics;
  const { rib, gap, kerf, cornerAllowance: ca, frontW, frontH } = params;
  const margin = 5;
  const gutter = 10;
  const tabW = 2;
  const f = (n) => String(Number(n.toFixed(4)));

  const columns = [
    { face: 'W', len: frontW - 2 * ca },
    { face: 'H', len: frontH - 2 * ca },
  ];

  const rects = [];
  let colX = margin + kerf / 2;
  let maxX = 0;

  for (const col of columns) {
    const grownW = col.len + kerf;
    for (let i = 0; i < ribCount; i++) {
      const yTop = margin + i * pitch;
      rects.push(
        `<rect data-role="rib" data-face="${col.face}" ` +
          `x="${f(colX - kerf / 2)}" y="${f(yTop - kerf / 2)}" ` +
          `width="${f(grownW)}" height="${f(rib + kerf)}"/>`
      );
    }
    for (let i = 0; i < ribCount - 1; i++) {
      const tabY = margin + i * pitch + rib - 1;
      const tabH = gap + 2;
      const leftX = colX;
      const rightX = colX + col.len - tabW;
      rects.push(
        `<rect data-role="tab" data-face="${col.face}" data-side="left" ` +
          `x="${f(leftX)}" y="${f(tabY)}" width="${f(tabW)}" height="${f(tabH)}"/>`
      );
      rects.push(
        `<rect data-role="tab" data-face="${col.face}" data-side="right" ` +
          `x="${f(rightX)}" y="${f(tabY)}" width="${f(tabW)}" height="${f(tabH)}"/>`
      );
    }
    maxX = colX - kerf / 2 + grownW;
    colX = colX + col.len + kerf + gutter;
  }

  const w = maxX + margin;
  const h = margin + (ribCount - 1) * pitch + rib + kerf / 2 + margin;
  const cut = LAYER.CUT;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" ` +
    `width="${f(w)}mm" height="${f(h)}mm" viewBox="0 0 ${f(w)} ${f(h)}">` +
    `<g inkscape:groupmode="layer" inkscape:label="${cut}" ` +
    `stroke="${LAYER_COLORS[cut]}" fill="none">` +
    rects.join('') +
    `</g></svg>`
  );
}
