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
 * Per-edge OUTWARD-NORMAL polygon offset (replaces the old bbox-centre radial offset).
 * Each vertex slides along the MITER of its two adjacent edges' outward normals, so the offset
 * is correct for convex apex vertices (a wide interlock rib's 45deg point) AND concave reflex
 * vertices (a narrow rib's notch). The bbox-radial approach put a ZERO offset on the bbox
 * centre-line (tilting the middle rib's bevel) and the WRONG sign at a reflex vertex.
 *   delta > 0 grows OUTWARD (laser kerf on an outer cut); delta < 0 shrinks INWARD (kerf on an
 *   interior notch). "Outward" is derived from the polygon's own signed-area winding, so both the
 *   outer boundary and the notch rectangles offset in the right direction regardless of trace
 *   order. Axis-aligned right-angle corners move by exactly (+-delta, +-delta) — geometrically
 *   identical to the former bbox-centre radial offset for clear (rectangular) columns.
 * @param {{x:number,y:number}[]} points  simple polygon, no repeated closing vertex
 * @param {number} delta  signed offset distance (mm)
 * @returns {{x:number,y:number}[]}
 */
export function offsetEdges(points, delta) {
  const n = points.length;
  if (n < 3) return points.map((p) => ({ ...p }));
  let area2 = 0;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    area2 += a.x * b.y - b.x * a.y;
  }
  // Outward normal of an edge with direction (dx,dy): (dy,-dx) for a positively-wound loop,
  // (-dy,dx) otherwise. This makes the normal point away from the enclosed interior either way.
  const pos = area2 > 0;
  const outN = (dx, dy) => (pos ? { x: dy, y: -dx } : { x: -dy, y: dx });
  const unit = (dx, dy) => {
    const L = Math.hypot(dx, dy) || 1;
    return { x: dx / L, y: dy / L };
  };
  const out = [];
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const cur = points[i];
    const next = points[(i + 1) % n];
    const d1 = unit(cur.x - prev.x, cur.y - prev.y); // incoming edge direction
    const d2 = unit(next.x - cur.x, next.y - cur.y); // outgoing edge direction
    const n1 = outN(d1.x, d1.y);
    const n2 = outN(d2.x, d2.y);
    let mx = n1.x + n2.x;
    let my = n1.y + n2.y;
    const ml = Math.hypot(mx, my);
    if (ml < 1e-9) {
      mx = n1.x; my = n1.y; // 180deg reversal (degenerate spike) — fall back to one normal
    } else {
      mx /= ml; my /= ml;
    }
    // miter length = 1/cos(half-angle); cos = miter . edgeNormal. Guards a perpendicular flip.
    const cos = mx * n1.x + my * n1.y;
    const scale = Math.abs(cos) < 1e-6 ? 1 : 1 / cos;
    out.push({ x: cur.x + delta * mx * scale, y: cur.y + delta * my * scale });
  }
  return out;
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
 * Ribs are left-aligned; the outer boundary follows each rib's own edges. Each rib polygon is
 * a convex 4-vertex shape with exactly two vertices at its top band edge (y=0) and two at its
 * bottom band edge (y=depth) — a clear rectangle (straight rails) OR an interlock TRAPEZOID (a
 * single diagonal per rib end, its point on a band edge). The tracer reads the left/right x at
 * each band edge and stitches them into ONE connected loop: down the left side rib-by-rib, then
 * up the right side. Outer grown OUTWARD by kerf/2; one middle connector-tab notch per gap, its
 * left/right edges FLOORED/CAPPED to the clear width [0, width] (then inset by tabW), so the
 * snap-apart tabs always land on the CLEAR edge — never on an OUTWARD interlock point tip
 * (x=-reach / x=width+reach) nor outside the material, and the inward-gap setback still leaves a tab.
 */
function traceColumn(ribs, colX0, datum, params) {
  const { rib, gap, kerf } = params;
  const pit = rib + gap;
  const half = kerf / 2;
  // floor at 1mm so the lattice never severs, even at cornerAllowance=0 (guards the original P0)
  const tabW = Math.max(1, Math.min(2, params.cornerAllowance));
  const N = ribs.length;

  // Read each rib's left/right x at both band edges (y=0 top, y=depth bottom). Works for a clear
  // rectangle (leftTop=leftBot=0, rightTop=rightBot=width) AND an interlock trapezoid (one edge
  // carries -reach/width+reach, the other setback/width-setback), so ONE tracer serves both.
  const rows = ribs.map((s, r) => {
    const yTop = datum + r * pit;
    const y0 = s.points.filter((p) => Math.abs(p.y) < 1e-6).map((p) => p.x);
    const yd = s.points.filter((p) => Math.abs(p.y - rib) < 1e-6).map((p) => p.x);
    return {
      yTop,
      yBot: yTop + rib,
      width: s.width,
      leftTop: Math.min(...y0),
      rightTop: Math.max(...y0),
      leftBot: Math.min(...yd),
      rightBot: Math.max(...yd),
    };
  });

  const outer = [];
  for (let r = 0; r < N; r++) {
    outer.push({ x: colX0 + rows[r].leftTop, y: rows[r].yTop });
    outer.push({ x: colX0 + rows[r].leftBot, y: rows[r].yBot });
  }
  for (let r = N - 1; r >= 0; r--) {
    outer.push({ x: colX0 + rows[r].rightBot, y: rows[r].yBot });
    outer.push({ x: colX0 + rows[r].rightTop, y: rows[r].yTop });
  }
  const subs = [pathData(offsetEdges(outer, half), true)]; // Z closes the top edge

  for (let i = 0; i < N - 1; i++) {
    // Left/right boundary of the tab notch at the gap between rib i (bottom) and rib i+1 (top),
    // FLOORED/CAPPED to the clear width [0, clearW] and then max'd/min'd with the adjacent rib edges.
    //   Clear rib:                        leftEdge=0,       rightEdge=clearW.
    //   Interlock INWARD gap  (leading bottom / rear top): leftEdge=setback, rightEdge=clearW-setback
    //     — the max(0,..)/min(clearW,..) keeps the setback so a deep setback still leaves a tab.
    //   Interlock OUTWARD gap (rear bottom / leading top): both adjacent edges are the WIDE base
    //     (-reach / clearW+reach = the POINT TIPS). Flooring at the RAW outer boundary would put the
    //     tab at x≈-reach / x≈clearW+reach — ON the interlock point, `reach` mm outside the clear
    //     width. The [0, clearW] floor/cap pins those tabs onto the clear edge, off the point.
    const clearW = Math.min(rows[i].width, rows[i + 1].width);
    const leftEdge = Math.max(0, rows[i].leftBot, rows[i + 1].leftTop);
    const rightEdge = Math.min(clearW, rows[i].rightBot, rows[i + 1].rightTop);
    const nl = colX0 + leftEdge + tabW;
    const nr = colX0 + rightEdge - tabW;
    if (nr <= nl) continue;
    const notch = [
      { x: nl, y: rows[i].yBot },
      { x: nr, y: rows[i].yBot },
      { x: nr, y: rows[i + 1].yTop },
      { x: nl, y: rows[i + 1].yTop },
    ];
    subs.push(pathData(offsetEdges(notch, -half), true));
  }
  return subs.join(' ');
}

/**
 * Stiffener rib-ladder SVG. Consumes the canonical rib shapes and emits ONE connected
 * CUT outline per column (outer boundary + per-gap middle notches) so the ribs stay
 * joined by ≤2 mm connector tabs and cut as a single snap-apart piece — no polygon-union
 * library. Kerf grows the outer boundary OUTWARD (parts come out at nominal width). Both
 * W and H families are emitted. cornerMode shapes the rib ends via computeRibShapes (clear
 * = plain inset rectangles; interlock = a wide rib POINTS out / a narrow rib is NOTCHED in).
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

  // Interlock makes a square's W and H columns EQUAL width but COMPLEMENTARY shape (W wide at
  // even ribIndex, H wide at odd), so a width-only dedupe would merge them into 4 identical WIDE
  // strips — the ring could never interlock, and it would disagree with the STL, which keeps the
  // families separate. Dedupe on SHAPE instead: compare the full rib-local polygons. Clear-mode
  // squares still merge (identical rectangles); interlock squares keep two complementary columns;
  // rectangular never merges (widths, hence points, differ).
  const samePoints = (a, b) =>
    a.length === b.length &&
    a.every((p, i) => Math.abs(p.x - b[i].x) < 1e-9 && Math.abs(p.y - b[i].y) < 1e-9);
  const sameShape =
    wRibs.length === hRibs.length &&
    wRibs.every((r, i) => samePoints(r.points, hRibs[i].points));
  // Quantity = number of WALLS a ladder column represents. A normal (un-merged) W or H
  // column is 2 identical walls (x2). When W and H dedupe into one merged square column
  // it stands in for all 4 walls of the ring (x4) — else the sheet would specify only 2
  // strips for a 4-wall square tube.
  const columns = sameShape
    ? [{ face: 'W', label: 'W/H', ribs: wRibs, qty: 4 }]
    : [
        { face: 'W', label: 'W', ribs: wRibs, qty: 2 },
        { face: 'H', label: 'H', ribs: hRibs, qty: 2 },
      ];

  // Reserve room for the left apex protrusion so it stays on-sheet.
  // In interlock mode traceColumn places a WIDE rib's left apex at colX0 + leftApex.x
  // (leftApex.x = -reach < 0). After kerf grow the rendered minX = colX0 - reach - kerf/2.
  // With reach=6 and margin=5 this lands at -1 (off-sheet). Shift colX0 right by leftPad
  // (= reach for uniform ribs) so the rendered left apex lands exactly at margin.
  // Clear mode: no left apex → leftPad=0 → byte-identical layout.
  const allRibs = [...wRibs, ...hRibs];
  const anyLeftApex = allRibs.some((s) => s.points.some((p) => p.x < 0));
  const leftPad = anyLeftApex
    ? Math.max(...allRibs.map((s) => { const la = s.points.find((p) => p.x < 0); return la ? -la.x : 0; }))
    : 0;

  // Symmetric to leftPad: reserve the widest RIGHT-apex overhang (= reach) so the rightmost
  // column's right points stay on-sheet. NOTE: with interlock, a column and its neighbour never
  // both point at the same band (complementary parity), so same-band point/point collisions no
  // longer occur — rightPad's only remaining job is the off-sheet clip of the rightmost column.
  // Clear mode has no right apex => rightPad = 0 => byte-identical layout to before.
  const anyRightApex = allRibs.some((s) => s.points.some((p) => p.x > s.width));
  const rightPad = anyRightApex
    ? Math.max(...allRibs.map((s) => { const ra = s.points.find((p) => p.x > s.width); return ra ? ra.x - s.width : 0; }))
    : 0;

  const cutPaths = [];
  const notes = [];
  let colX0 = margin + kerf / 2 + leftPad;
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
    maxRight = colX0 + width + kerf / 2 + rightPad;
    colX0 = colX0 + width + kerf + gutter + rightPad;
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
