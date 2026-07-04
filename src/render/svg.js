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
 *
 * KNOWN LIMITATION (accepted, within +-0.3mm target): on tapered columns this
 * bbox-centre offset pushes ribs narrower than half the widest rib inward by
 * ~1 kerf (~0.15mm undersize). Straight/rectangular columns are exact. Tapered
 * is experimental; revisit with a per-edge normal offset if tapered precision
 * is tightened.
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
 * Trace ONE connected ladder outline for a column of ribs (widths may vary per pleat).
 * Ribs are left-aligned (straight left rail); the outer boundary follows each rib's own
 * right edge with a tab jog across every gap, giving a per-pleat trapezoid for tapered
 * bellows (P3). Outer grown OUTWARD by kerf/2; one middle notch per gap shrunk INWARD,
 * clamped to the narrower adjacent rib so the connector tabs survive the width step.
 */
function traceColumn(ribs, colX0, datum, params) {
  const { rib, gap, kerf } = params;
  const pit = rib + gap;
  const half = kerf / 2;
  // floor at 1mm so the lattice never severs, even at cornerAllowance=0 (guards the original P0)
  const tabW = Math.max(1, Math.min(2, params.cornerAllowance));
  const N = ribs.length;

  const rows = ribs.map((s, r) => {
    const yTop = datum + r * pit;
    return { xL: colX0, xR: colX0 + s.width, yTop, yBot: yTop + rib, shape: s };
  });

  // Down the LEFT side following each rib edge (+ left-apex jog for pointed/alternating),
  // then up the RIGHT side following each rib edge (+ right-apex jog) + tab jogs. Between
  // ribs the left boundary stays at colX0 (next iteration's yTop continues the rail), so
  // clear mode (no apex) yields the same straight left rail as before — no redundant push.
  const outer = [];
  for (let r = 0; r < N; r++) {
    const s = rows[r].shape;
    const leftApex = s.points.find((p) => p.x < 0); // pointed/alternating outer apex (x < 0)
    outer.push({ x: rows[r].xL, y: rows[r].yTop });
    if (leftApex) {
      // left rail follows the canonical polygon out to the 45deg apex on the y-midline
      // (leftApex.x is negative → colX0 - reach, the outward protrusion toward the corner)
      outer.push({ x: rows[r].xL + leftApex.x, y: rows[r].yTop + rib / 2 });
    }
    outer.push({ x: rows[r].xL, y: rows[r].yBot });
  }
  for (let r = N - 1; r >= 0; r--) {
    const s = rows[r].shape;
    const rightApex = s.points.find((p) => p.x > s.width); // pointed/alternating outer apex
    outer.push({ x: rows[r].xR, y: rows[r].yBot });
    if (rightApex) {
      // right rail follows the canonical polygon out to the 45deg apex on the y-midline
      outer.push({ x: rows[r].xR + (rightApex.x - s.width), y: rows[r].yTop + rib / 2 });
    }
    outer.push({ x: rows[r].xR, y: rows[r].yTop });
    if (r > 0) outer.push({ x: rows[r - 1].xR, y: rows[r].yTop }); // tab jog to next rib width
  }
  const subs = [pathData(offsetFromCentre(outer, half), true)]; // Z closes the top edge

  for (let i = 0; i < N - 1; i++) {
    const nl = colX0 + tabW;
    const nr = Math.min(rows[i].xR, rows[i + 1].xR) - tabW; // clamp to the narrower rib
    if (nr <= nl) continue;
    const notch = [
      { x: nl, y: rows[i].yBot },
      { x: nr, y: rows[i].yBot },
      { x: nr, y: rows[i + 1].yTop },
      { x: nl, y: rows[i + 1].yTop },
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
  const { rib, gap, kerf, cornerAllowance: ca, endMargin } = params;
  const f = fmt;                    // Phase-6 snippets use f(); fmt is the module formatter
  const pit = rib + gap;
  const pitch = pit;                // Phase-6 snippets use pitch; pit = rib + gap
  const margin = 5;                 // lateral sheet padding (x/side only)
  const datum = endMargin;          // shared y-origin with the fabric ENGRAVE footprints (registration)
  const gutter = 10;

  const wRibs = faceColumnRibs(shapes, 'W');
  const hRibs = faceColumnRibs(shapes, 'H');
  const ribCount = wRibs.length;

  const sameWidths =
    wRibs.length === hRibs.length &&
    wRibs.every((r, i) => Math.abs(r.width - hRibs[i].width) < 1e-9);
  // Quantity = number of WALLS a ladder column represents. A normal (un-merged) W or H
  // column is 2 identical walls (x2). When W and H dedupe into one merged square column
  // it stands in for all 4 walls of the ring (x4) — else the sheet would specify only 2
  // strips for a 4-wall square tube.
  const columns = sameWidths
    ? [{ face: 'W', label: 'W/H', ribs: wRibs, qty: 4 }]
    : [
        { face: 'W', label: 'W', ribs: wRibs, qty: 2 },
        { face: 'H', label: 'H', ribs: hRibs, qty: 2 },
      ];

  const cutPaths = [];
  const notes = [];
  let colX0 = margin + kerf / 2;
  let maxRight = 0;

  for (const col of columns) {
    const width = Math.max(...col.ribs.map((r) => r.width)); // widest pleat for layout
    col.x0 = colX0;   // expose the column left edge to Phase 6 (spine/labels/calibration)
    col.width = width;
    const d = traceColumn(col.ribs, colX0, datum, params);
    cutPaths.push(
      `<path data-role="ladder" data-face="${col.face}" data-qty="${col.qty}" fill-rule="evenodd" d="${d}"/>`
    );
    notes.push(
      `<text data-role="qty" data-face="${col.face}" ` +
        `x="${fmt(colX0)}" y="${fmt(datum - 1.5)}">${col.label} cut x${col.qty}</text>`
    );
    maxRight = colX0 + width + kerf / 2;
    colX0 = colX0 + width + kerf + gutter;
  }

  const w = maxRight + margin;
  const CALIBRATION_MM = 50; // 1:1 scale check — mirrors CALIBRATION_MM in export/pdf.js
  const stackH = (ribCount - 1) * pitch + rib;
  const h = datum + stackH + margin + CALIBRATION_MM + margin;
  const cut = LAYER.CUT;

  const spineMarks = columns
    .map((col) => {
      const cx = col.x0 + col.width / 2;
      return (
        `<line data-role="spine" data-face="${col.face}" ` +
        `x1="${f(cx)}" y1="${f(datum)}" x2="${f(cx)}" y2="${f(datum + stackH)}"/>`
      );
    })
    .join('');

  const spineGroup =
    `<g inkscape:groupmode="layer" inkscape:label="${LAYER.FOLD_VALLEY}" ` +
    `stroke="${LAYER_COLORS[LAYER.FOLD_VALLEY]}" fill="none">${spineMarks}</g>`;

  const labelMarks = columns
    .map((col) => {
      const wall = shapes.find((s) => s.face === col.face);
      const colShapes = shapes
        .filter((s) => s.face === col.face && s.wallIndex === wall.wallIndex)
        .sort((a, b) => a.ribIndex - b.ribIndex);
      const cx = col.x0 + col.width / 2;
      return colShapes
        .map((s) => {
          const ty = datum + s.ribIndex * pitch + rib / 2;
          const corner = `L${f(s.cornerShare.leftCorner)}/R${f(s.cornerShare.rightCorner)}`;
          return (
            `<text data-role="rib-label" data-index="${s.ribIndex}" ` +
            `data-face="${s.face}" data-corner="${corner}" ` +
            `x="${f(cx)}" y="${f(ty)}" font-size="2.5" text-anchor="middle">` +
            `${s.ribIndex}${s.face} ${corner}</text>`
          );
        })
        .join('');
    })
    .join('');

  const calX = margin;
  const calY = datum + stackH + margin;
  const calSquare =
    `<rect data-role="calibration" x="${f(calX)}" y="${f(calY)}" ` +
    `width="${f(CALIBRATION_MM)}" height="${f(CALIBRATION_MM)}"/>` +
    `<text data-role="calibration-label" x="${f(calX)}" y="${f(calY - 1)}" ` +
    `font-size="3">${CALIBRATION_MM} mm</text>`;

  const engraveGroup =
    `<g inkscape:groupmode="layer" inkscape:label="${LAYER.ENGRAVE}" ` +
    `stroke="${LAYER_COLORS[LAYER.ENGRAVE]}" fill="none">${labelMarks}${calSquare}</g>`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" ` +
    `data-datum="${f(datum)}" ` +
    `width="${f(w)}mm" height="${f(h)}mm" viewBox="0 0 ${f(w)} ${f(h)}">` +
    `<g inkscape:groupmode="layer" inkscape:label="${cut}" ` +
    `stroke="${LAYER_COLORS[cut]}" fill="none">` +
    cutPaths.join('') +
    `</g>` +
    `<g inkscape:groupmode="layer" inkscape:label="${LAYER.ENGRAVE}" ` +
    `stroke="${LAYER_COLORS[LAYER.ENGRAVE]}" fill="none">` +
    notes.join('') +
    `</g>` +
    spineGroup +
    engraveGroup +
    `</svg>`
  );
}
