import { LAYER, LAYER_COLORS } from '../constants.js';
import { computeWallRibLayout } from '../geometry/wallRibLayout.js';
import { computeCornerCombs } from '../geometry/cornerCombs.js';
// Share the breakaway-tab X positions with the 3D STL (export/stl.js): the laser connector tabs and
// the printed breakaway bridges must land at the SAME inset positions. This import is acyclic —
// stl.js does not import svg.js — so it is the lowest-churn way to keep the two in lockstep.
import { bridgeTabXs } from '../export/stl.js';

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

// Master-sheet layout constants (mm). SHEET_MARGIN mirrors the old lateral padding; BLOCK_GUTTER
// mirrors the ladder gutter; CALIBRATION_MM mirrors export/pdf.js' 50mm 1:1 check.
const SHEET_MARGIN = 5;
const BLOCK_GUTTER = 10;
const CALIBRATION_MM = 50;

const fmt = (n) => String(Math.round(n * 1e4) / 1e4);

// Fixed builder-facing assembly legend. Drawn UPRIGHT in SHEET-LOCAL coords at the TOP-LEFT
// corner (distinct from the bottom-left calibration square) and appended OUTSIDE the content /
// blocks group on EVERY bed sheet, so the whole-sheet rotation of the rib/fold masters (Tasks
// 3/4) never tips it sideways. ENGRAVE layer, one <text> per line.
const ASSEMBLY_LEGEND_LINES = [
  'Glue ribs between the fold lines, longest first; gap centred on each crease; fold after gluing',
  'Each fold line runs down the MIDDLE of a bare gap, ~gap/2 clear of each rib',
  'Corner points tuck across the gap; they do NOT meet the crease',
];

/** Sheet-level ENGRAVE assembly legend: upright, anchored top-left in sheet-local coords. */
function assemblyLegendGroup() {
  const texts = ASSEMBLY_LEGEND_LINES.map(
    (line, i) =>
      `<text data-role="assembly-legend" data-line="${i}" ` +
      `x="${fmt(SHEET_MARGIN)}" y="${fmt(SHEET_MARGIN + 4 + i * 4)}" font-size="3">${line}</text>`
  ).join('');
  return (
    `<g inkscape:groupmode="layer" inkscape:label="${LAYER.ENGRAVE}" ` +
    `stroke="${LAYER_COLORS[LAYER.ENGRAVE]}" fill="none">${texts}</g>`
  );
}

/**
 * gap/2-clearance annotation for the fold-pattern master sheets. Emitted INSIDE the pattern
 * CONTENT group (flat coords) so it tiles across bed sheets and (Task 3) rotates WITH the
 * geometry it labels. Pins to ONE TRANSVERSE fold-vs-rib gap on the first full face: the first
 * (i=0) rib's bottom band edge sits at endMargin+rib and the transverse crease is drawn gap/2
 * below it (straight.js: fy = endMargin + rib + i*pitch + gap/2). A short vertical dimension
 * between those two ys (with end ticks + a label) proves the fold falls mid-gap, gap/2 clear of
 * the rib. Not a longitudinal corner fold and not a miter diagonal — a transverse crease only.
 */
function gapClearanceAnnotation(params) {
  const { rib, gap, endMargin, frontW, cornerAllowance } = params;
  const yEdge = endMargin + rib;                     // first rib's bottom band edge (i=0)
  const yCrease = yEdge + gap / 2;                   // transverse fold at the gap centre
  const xDim = frontW / 2 + cornerAllowance + 6;     // inside the first full face's clear zone
  const tick = 2;                                    // end-tick half-width (mm)
  const seg = (x1, y1, x2, y2) =>
    `<path data-role="gap-dim" d="M ${fmt(x1)} ${fmt(y1)} L ${fmt(x2)} ${fmt(y2)}"/>`;
  const marks =
    seg(xDim, yEdge, xDim, yCrease) +                     // the gap/2 dimension line
    seg(xDim - tick, yEdge, xDim + tick, yEdge) +         // top tick at the rib band edge
    seg(xDim - tick, yCrease, xDim + tick, yCrease) +     // bottom tick at the crease
    `<text data-role="gap-dim-label" x="${fmt(xDim + tick + 1)}" ` +
    `y="${fmt((yEdge + yCrease) / 2)}" font-size="2.5">` +
    `gap/2 = ${fmt(gap / 2)} mm (fold mid-gap)</text>`;
  return (
    `<g inkscape:groupmode="layer" inkscape:label="${LAYER.ENGRAVE}" ` +
    `stroke="${LAYER_COLORS[LAYER.ENGRAVE]}" fill="none">${marks}</g>`
  );
}

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

/**
 * Build the ordered inkscape LAYER groups for a continuous flat drawing. Extracted so BOTH the
 * whole-sheet renderPatternSVG (preview + legacy single-file) and the bed-sized master sheets
 * share ONE segment/kerf code path. Byte-identical to the former inline body of renderPatternSVG.
 * @param {import('../geometry/types.js').PatternModel} model
 * @param {object} params
 * @returns {string} the "<g …>…</g>" groups joined by "\n"
 */
function patternLayerGroups(model, params) {
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
  return groups.join('\n');
}

export function renderPatternSVG(model, params) {
  const { w, h } = model.bounds;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" ` +
    `width="${fmt(w)}mm" height="${fmt(h)}mm" viewBox="0 0 ${fmt(w)} ${fmt(h)}">\n` +
    patternLayerGroups(model, params) +
    `\n</svg>`
  );
}

/**
 * Bed-sized grid tiling for a continuous flat drawing. Bed-sized re-implementation of the retired
 * `planTiles`: NO bleed margin, NO crop marks, NO page-N labels — each tile is exactly ONE laser
 * bed (bedW x bedH mm) and tiles butt edge-to-edge (stride == bed size).
 * @param {{w:number,h:number}} bounds  flat drawing extent (mm)
 * @param {{bedW:number,bedH:number}} params
 * @returns {{cols:number,rows:number,count:number,bedW:number,bedH:number,
 *   tiles: Array<{index:number,col:number,row:number,x:number,y:number,w:number,h:number}>}}
 */
export function planBedTiles(bounds, params) {
  const bedW = params.bedW;
  const bedH = params.bedH;
  const cols = Math.max(1, Math.ceil(bounds.w / bedW));
  const rows = Math.max(1, Math.ceil(bounds.h / bedH));
  const tiles = [];
  let index = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      tiles.push({ index, col, row, x: col * bedW, y: row * bedH, w: bedW, h: bedH });
      index++;
    }
  }
  return { cols, rows, count: cols * rows, bedW, bedH, tiles };
}

/**
 * Bed-sized fold-pattern MASTER SHEETS. The continuous fold pattern is grid-tiled/cropped at
 * bedW x bedH (`planBedTiles`); each tile becomes one 1:1-mm SVG whose viewport shows only that
 * bed's slice — content is translated by (-tileX,-tileY) and clipped to the bed rect — plus a
 * 50 mm ENGRAVE calibration square in sheet-local coords. Overflow yields multiple sheets
 * (row-major). No crop marks / bleed / page-N labels (unlike the retired tiled PDF). The outer
 * <svg> viewport AND the clipPath both crop, so paths that run off the bed are not cut.
 * @param {import('../geometry/types.js').PatternModel} model
 * @param {object} params  must carry bedW/bedH (mm) and kerf
 * @returns {string[]} one SVG string per bed sheet
 */
export function renderPatternSheets(model, params) {
  // Whole-sheet 0/90 auto-rotation. Tile the pattern in BOTH orientations and keep the one that
  // needs FEWER bed sheets (tie -> un-rotated). Rotation is a pure SVG transform on the content
  // group below; the flat geometry coordinates are never rotated. SVG rotate(90) is CW and maps
  // (x,y)->(-y,x), so a flat x in [0,W] lands in X in [-H,0]; translate(H,0) (H=model.bounds.h)
  // re-seats it into the rotated frame [0,H]x[0,W]. The per-tile (-t.x,-t.y) offset lives in that
  // rotated frame and stays the OUTER group, applied AFTER the rotation.
  const upright = planBedTiles(model.bounds, params);
  const swapped = planBedTiles({ w: model.bounds.h, h: model.bounds.w }, params);
  const rotated = swapped.count < upright.count;
  const plan = rotated ? swapped : upright;
  const H = model.bounds.h;
  const rotOpen = rotated ? `<g transform="translate(${fmt(H)},0) rotate(90)">` : '';
  const rotClose = rotated ? '</g>' : '';
  const groups = patternLayerGroups(model, params);
  const bedW = params.bedW;
  const bedH = params.bedH;
  const CALIBRATION_MM = 50; // 1:1 scale check — mirrors renderRibLadderSVG + the retired PDF
  const margin = 5;
  const calX = margin;
  const calY = Math.max(margin, bedH - margin - CALIBRATION_MM);
  const calGroup =
    `<g inkscape:groupmode="layer" inkscape:label="${LAYER.ENGRAVE}" ` +
    `stroke="${LAYER_COLORS[LAYER.ENGRAVE]}" fill="none">` +
    `<rect data-role="calibration" x="${fmt(calX)}" y="${fmt(calY)}" ` +
    `width="${fmt(CALIBRATION_MM)}" height="${fmt(CALIBRATION_MM)}"/>` +
    `<text data-role="calibration-label" x="${fmt(calX)}" y="${fmt(calY - 1)}" ` +
    `font-size="3">${CALIBRATION_MM} mm</text>` +
    `</g>`;

  // gap/2-clearance annotation, computed once (tile-independent) and drawn INSIDE the pattern
  // content group so it tiles + (Task 3) rotates with the geometry it labels.
  const gapAnno = gapClearanceAnnotation(params);

  return plan.tiles.map(
    (t) =>
      `<svg xmlns="http://www.w3.org/2000/svg" ` +
      `xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" ` +
      `data-sheet="${t.index + 1}" data-sheets="${plan.count}" ` +
      `data-col="${t.col}" data-row="${t.row}" ` +
      `width="${fmt(bedW)}mm" height="${fmt(bedH)}mm" viewBox="0 0 ${fmt(bedW)} ${fmt(bedH)}">\n` +
      `<defs><clipPath id="bed"><rect x="0" y="0" ` +
      `width="${fmt(bedW)}" height="${fmt(bedH)}"/></clipPath></defs>\n` +
      `<g clip-path="url(#bed)"><g transform="translate(${fmt(-t.x)},${fmt(-t.y)})">${rotOpen}\n` +
      groups +
      `\n` + gapAnno +
      `\n${rotClose}</g></g>\n` +
      calGroup +
      assemblyLegendGroup() +
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

/**
 * Trace ONE connected ladder outline for a column of ribs (widths may vary per pleat).
 * Ribs are left-aligned; the outer boundary follows each rib's own edges. Each rib polygon is
 * a convex 4-vertex shape with exactly two vertices at its top band edge (y=0) and two at its
 * bottom band edge (y=depth) — a clear rectangle (straight rails) OR an interlock TRAPEZOID (a
 * single diagonal per rib end, its point on a band edge). The tracer reads the left/right x at
 * each band edge and stitches them into ONE connected loop: down the left side rib-by-rib, then
 * up the right side. Outer grown OUTWARD by kerf/2; per gap the connector tabs sit at the SHARED
 * bridgeTabXs positions (same as the 3D STL breakaway bridges): TWO tabs INSET by cornerAllowance
 * from the clamped clear-span edges (a small face collapses to ONE centred tab). The gap is cut
 * across its FULL extent [cutLeft, cutRight] — out to the OUTWARD interlock point tips (x=-reach /
 * x=width+reach), so the tip triangles never web the ribs together — EVERYWHERE except a tabW-wide
 * strip on each tab centre. So the ribs join ONLY by the inset tabs and every rib END (points
 * included) is fully cut free, matching the STL's discrete ribs + breakaway bridges. Note the tab
 * SPAN stays clamped to the clear width (off the points) even though the CUT runs out to the tips.
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
    // Two DISTINCT spans for the gap between rib i (bottom) and rib i+1 (top):
    //
    // 1. The CUT EXTENT [cutLeft, cutRight] — the FULL width the outer blob fills across this gap,
    //    i.e. the widest of the two facing band edges. On an interlock OUTWARD gap both facing edges
    //    are the WIDE base, so this reaches the POINT TIPS (x=-reach / x=clearW+reach). The whole
    //    gap-fill must be cut (minus the tab strips) or the tips WELD the ribs together at the fold
    //    points. Clamping the cut to the clear width (as before) left those tip triangles uncut.
    //
    // 2. The TAB SPAN [tabLo, tabHi] — the clear overlap [0, clearW] clamped to the adjacent edges,
    //    where the connector tabs must land so they sit on BOTH ribs and OFF the outward points.
    //      Clear rib:            tabLo=0,       tabHi=clearW      (cutLeft/cutRight identical).
    //      Interlock INWARD gap: tabLo=setback, tabHi=clearW-setback (== cut extent; setback keeps a tab).
    //      Interlock OUTWARD gap: tabLo=0, tabHi=clearW — inset ONTO the clear edge, `reach` inside
    //        the tips, so the tabs are never on a point even though the cut runs out to the tips.
    const clearW = Math.min(rows[i].width, rows[i + 1].width);
    const cutLeft = Math.min(rows[i].leftBot, rows[i + 1].leftTop);
    const cutRight = Math.max(rows[i].rightBot, rows[i + 1].rightTop);
    const tabLo = Math.max(0, rows[i].leftBot, rows[i + 1].leftTop);
    const tabHi = Math.min(clearW, rows[i].rightBot, rows[i + 1].rightTop);
    if (tabHi - tabLo <= 0) continue; // no clear overlap (degenerate tiny face) — leave the gap joined
    // Tab centres INSET by cornerAllowance from the min-clear-width span — the SAME inset the 3D STL
    // breakaway bridges use (bridgeTabXs(minClearWidth, columnCentre, ca)): TWO tabs normally, ONE
    // centred tab on a small face. Passing the FULL clearW (not the setback-narrowed span tabHi-tabLo)
    // restores cross-artifact PARITY of the tab INSET/SEPARATION — the old narrowed span pushed
    // interlock INWARD-gap tabs ~setback further in than the STL and shifted the 1-vs-2-tab threshold.
    // Parity scope: (1) the SEPARATION (clearW-2ca) and per-edge inset (ca) now match the STL on EVERY
    //   bellows; the ABSOLUTE position coincides exactly for STRAIGHT (equal-adjacent-width) faces, and
    //   on a taper differs on the WIDER rib by (wWide-wNarrow)/2 because this ladder LEFT-aligns ribs at
    //   colX0 while the STL CENTER-aligns them on xCursor — a layout convention, not a defect (each tab
    //   still lands on both ribs). (2) The clamp into [tabLo, tabHi] keeps each tab on BOTH ribs: a
    //   NO-OP when setback<=cornerAllowance (straight + narrowing tapers + clear), ACTIVE only on
    //   WIDENING tapers (setback>ca) where it pins the tab to the setback edge, trading exactness for
    //   connectivity (the STL bridge floats off the setback there — a separate pre-existing STL issue).
    const ca = params.cornerAllowance;
    const centres = bridgeTabXs(clearW, clearW / 2, ca)
      .map((c) => Math.min(tabHi, Math.max(tabLo, c)))
      .sort((a, b) => a - b);
    // CUT the gap across the FULL extent [cutLeft, cutRight] EVERYWHERE except a tabW-wide strip on
    // each tab centre: the cut sub-rectangles are the COMPLEMENT of those strips. `bounds` interleaves
    // the extent ends with each strip's [centre-tabW/2, centre+tabW/2], so successive pairs are the
    // cuts: [cutLeft, c1-tabW/2], [c1+tabW/2, c2-tabW/2], [c2+tabW/2, cutRight] (or two spans, 1 tab).
    const bounds = [cutLeft, ...centres.flatMap((c) => [c - tabW / 2, c + tabW / 2]), cutRight];
    for (let k = 0; k < bounds.length; k += 2) {
      const a = Math.max(cutLeft, bounds[k]);
      const b = Math.min(cutRight, bounds[k + 1]);
      if (b - a <= 0) continue; // strips at/over the ends collapse the neighbouring cut to nothing
      const nl = colX0 + a;
      const nr = colX0 + b;
      const notch = [
        { x: nl, y: rows[i].yBot },
        { x: nr, y: rows[i].yBot },
        { x: nr, y: rows[i + 1].yTop },
        { x: nl, y: rows[i + 1].yTop },
      ];
      subs.push(pathData(offsetEdges(notch, -half), true));
    }
  }
  return subs.join(' ');
}

/** The 4 whole walls (W,H,W,H) from the shared fabric-placement foundation, ribs sorted rear->front.
 *  Ignores computeWallRibLayout's unrolled x; the master sheet overrides x with its own packer. */
export function collectWalls(params) {
  const layout = computeWallRibLayout(params);
  const byWall = new Map();
  for (const r of layout) {
    if (!byWall.has(r.wallIndex)) byWall.set(r.wallIndex, { face: r.face, wallIndex: r.wallIndex, ribs: [] });
    byWall.get(r.wallIndex).ribs.push(r);
  }
  const walls = [...byWall.values()].sort((a, b) => a.wallIndex - b.wallIndex);
  for (const w of walls) w.ribs.sort((a, b) => a.ribIndex - b.ribIndex);
  return walls;
}

/**
 * 2D bed packer. (1) Splits every wall lattice taller than the usable bed height into
 * bed-fitting segments — the SAME greedy grow-until-overrun loop the STL bed-wrap uses, each
 * segment its own snap-apart lattice. (2) Shelf-packs the segment blocks left->right across the
 * usable bed width, wrapping to a new shelf and then to a new bed sheet on overflow. A bottom
 * band (CALIBRATION_MM + SHEET_MARGIN) is reserved on every sheet for the calibration square, so
 * blocks never collide with it.
 * @returns {{blocks:Object[]}[]} one entry per bed sheet.
 */
export function packRibSheets(walls, params) {
  const { rib, gap, kerf, bedW, bedH } = params;
  const pitch = rib + gap;
  const usableW = bedW - 2 * SHEET_MARGIN;
  const usableH = bedH - 3 * SHEET_MARGIN - CALIBRATION_MM; // reserve the bottom calibration band
  // The rib STACK (height) is the only splittable axis; the rib WIDTH is un-splittable and must fit
  // the CROSS bed dimension. Greedy stack-split: how many bed-fitting segments a stack of `n` ribs
  // needs for a given axial `budget` (mirrors the segment loop below + stl.js bed-wrap).
  const countSegments = (n, budget) => {
    let segs = 0;
    let i = 0;
    while (i < n) {
      let len = 0;
      let j = i;
      while (j < n) {
        const add = j === i ? rib : gap + rib;
        if (j > i && len + add > budget) break;
        len += add;
        j++;
      }
      i = j;
      segs++;
    }
    return segs;
  };

  // (1) Choose each wall's orientation, THEN split its stack into bed-fitting segment blocks.
  const blocks = [];
  for (const wall of walls) {
    const ribs = wall.ribs;
    if (!ribs.length) continue;
    const widthMax = Math.max(...ribs.map((r) => r.width));
    const leftPad = Math.max(0, ...ribs.map((r) => -Math.min(...r.points.map((p) => p.x))));
    const rightPad = Math.max(0, ...ribs.map((r) => Math.max(...r.points.map((p) => p.x)) - r.width));
    const contentW = kerf + leftPad + widthMax + rightPad; // un-splittable rib-width cross dimension

    // Un-rotated: stack along Y (split budget usableH, cross-dim vs usableW).
    // Rotated 90deg: stack along X (split budget usableW, cross-dim vs usableH).
    // PREFER an orientation whose cross-dim FITS its bed dimension; among those pick FEWEST stack
    // segments; tie -> un-rotated. Never trade a fitting cross-dim for "fewer segments" that
    // overflows the bed the un-splittable width lands on.
    const budgetUn = Math.max(rib, usableH - kerf);
    const budgetRot = Math.max(rib, usableW - kerf);
    const options = [
      { rotated: false, fits: contentW <= usableW, budget: budgetUn,
        segs: countSegments(ribs.length, budgetUn), crossBed: usableW, dim: 'width', dimParam: 'bedW' },
      { rotated: true, fits: contentW <= usableH, budget: budgetRot,
        segs: countSegments(ribs.length, budgetRot), crossBed: usableH, dim: 'height', dimParam: 'bedH' },
    ];
    const fitting = options.filter((o) => o.fits);
    const pool = fitting.length ? fitting : options;
    pool.sort((a, b) => a.segs - b.segs || Number(a.rotated) - Number(b.rotated));
    const choice = pool[0];

    // A rib cannot be split across its WIDTH, so a wall whose CHOSEN-orientation cross-dim exceeds
    // its bed dimension overruns unavoidably. Warn (once per wall) but still emit — the geometry is
    // correct, only the chosen bed is too small to cut it in one piece.
    if (!choice.fits) {
      console.warn(
        `Rib wall ${wall.face}${wall.wallIndex} width ${contentW.toFixed(1)}mm exceeds ` +
          `usable bed ${choice.dim} ${choice.crossBed.toFixed(1)}mm; ` +
          `increase ${choice.dimParam} or reduce the opening`
      );
    }

    let segStart = 0;
    let segIndex = 0;
    while (segStart < ribs.length) {
      let segLen = 0;
      let segEnd = segStart;
      while (segEnd < ribs.length) {
        const add = segEnd === segStart ? rib : gap + rib;
        if (segEnd > segStart && segLen + add > choice.budget) break;
        segLen += add;
        segEnd++;
      }
      const segRibs = ribs.slice(segStart, segEnd);
      const contentH = kerf + (segRibs.length - 1) * pitch + rib;
      // Rotated 90deg: swap so the shelf packer (width-wrap + new-sheet below) reads the ON-SHEET
      // footprint — oriented width = stack length, oriented height = rib-width band.
      blocks.push({
        face: wall.face, wallIndex: wall.wallIndex, segIndex, rotated: choice.rotated,
        ribs: segRibs, widthMax, leftPad, rightPad,
        contentW: choice.rotated ? contentH : contentW,
        contentH: choice.rotated ? contentW : contentH,
      });
      segStart = segEnd;
      segIndex++;
    }
  }

  // Corner-gap combs: one un-split block per corner, appended so the shelf packer places them
  // alongside the rib lattices (same 0/90 rotation policy). A comb is not stack-splittable.
  for (const comb of computeCornerCombs(params)) {
    const cw = kerf + comb.bbox.w; // gap-span cross dimension
    const ch = kerf + comb.bbox.h; // full pleated length
    const fitsUn = cw <= usableW && ch <= usableH;
    const fitsRot = ch <= usableW && cw <= usableH;
    const rotated = fitsUn ? false : fitsRot ? true : ch > usableW; // prefer un; else rot; else lay long side along width
    if (!fitsUn && !fitsRot) {
      console.warn(
        `Corner comb ${comb.cornerIndex} (${cw.toFixed(1)}x${ch.toFixed(1)}mm) exceeds usable bed; ` +
          `increase bedW/bedH`
      );
    }
    blocks.push({
      kind: 'comb', comb, rotated,
      contentW: rotated ? ch : cw,
      contentH: rotated ? cw : ch,
    });
  }

  // (2) Shelf-pack blocks onto bed sheets.
  const sheets = [];
  let sheet = null;
  let shelfX = 0;
  let shelfY = 0;
  let shelfH = 0;
  const startSheet = () => {
    sheet = { blocks: [] };
    sheets.push(sheet);
    shelfX = SHEET_MARGIN;
    shelfY = SHEET_MARGIN;
    shelfH = 0;
  };
  startSheet();
  for (const block of blocks) {
    if (sheet.blocks.length && shelfX + block.contentW > SHEET_MARGIN + usableW) {
      shelfX = SHEET_MARGIN;         // wrap to the next shelf
      shelfY += shelfH + BLOCK_GUTTER;
      shelfH = 0;
    }
    if (sheet.blocks.length && shelfY + block.contentH > SHEET_MARGIN + usableH) {
      startSheet();                  // shelf overflows the bed -> new sheet
    }
    block.x = shelfX;
    block.y = shelfY;
    sheet.blocks.push(block);
    shelfX += block.contentW + BLOCK_GUTTER;
    shelfH = Math.max(shelfH, block.contentH);
  }
  return sheets;
}

/** Emit one comb block into the layer sinks (cutPaths, mountains, valleys, labels). Mirrors the
 *  rib-block rotation machinery: un-rotated → absolute coords; rotated → block-local coords + a
 *  per-layer transform group. */
function renderCombBlock(block, params, sinks) {
  const f = fmt;
  const half = params.kerf / 2;
  const comb = block.comb;
  const ox = block.rotated ? half : block.x + half;
  const oy = block.rotated ? half : block.y + half;
  const pt = (p) => `${f(ox + p.x)},${f(oy + p.y)}`;
  const outlineD = `M ${comb.outline.map(pt).join(' L ')} Z`;
  const cutEl =
    `<path data-role="comb" data-corner="${comb.cornerIndex}" fill-rule="evenodd" d="${outlineD}"/>`;
  const scoreEl = (s) =>
    `<line data-role="comb-score" data-corner="${comb.cornerIndex}" ` +
    `x1="${f(ox + s.points[0].x)}" y1="${f(oy + s.points[0].y)}" ` +
    `x2="${f(ox + s.points[1].x)}" y2="${f(oy + s.points[1].y)}"/>`;
  const mEls = comb.scores.filter((s) => s.type === LAYER.FOLD_MOUNTAIN).map(scoreEl).join('');
  const vEls = comb.scores.filter((s) => s.type === LAYER.FOLD_VALLEY).map(scoreEl).join('');
  const labelEl =
    `<text data-role="comb-label" data-corner="${comb.cornerIndex}" ` +
    `x="${f(ox + comb.bbox.w / 2)}" y="${f(oy + 8)}" font-size="2.5" text-anchor="middle">` +
    `${comb.label}</text>`;
  if (block.rotated) {
    const orientedW = block.contentW; // swapped: comb length runs along screen X
    const xform = `translate(${f(block.x + orientedW)}, ${f(block.y)}) rotate(90)`;
    sinks.cutPaths.push(`<g transform="${xform}">${cutEl}</g>`);
    if (mEls) sinks.mountains.push(`<g transform="${xform}">${mEls}</g>`);
    if (vEls) sinks.valleys.push(`<g transform="${xform}">${vEls}</g>`);
    sinks.labels.push(`<g transform="${xform}">${labelEl}</g>`);
  } else {
    sinks.cutPaths.push(cutEl);
    if (mEls) sinks.mountains.push(mEls);
    if (vEls) sinks.valleys.push(vEls);
    sinks.labels.push(labelEl);
  }
}

/** One bed sheet: packed lattices (CUT) + spine scores (FOLD_VALLEY) + rib labels & calibration (ENGRAVE). */
export function renderRibSheetSVG(blocks, params, sheetIndex, sheetCount, opts = {}) {
  const { rib, gap, kerf, bedW, bedH } = params;
  const pitch = rib + gap;
  const f = fmt;
  const cut = LAYER.CUT;
  const cutPaths = [];
  const spines = [];
  const labels = [];
  const mountains = []; // comb FOLD_MOUNTAIN scores (empty unless cornerCombs on)
  for (const block of blocks) {
    if (block.kind === 'comb') {
      renderCombBlock(block, params, { cutPaths, mountains, valleys: spines, labels });
      continue;
    }
    // Un-rotated blocks emit ABSOLUTE coords (byte-identical to before). Rotated blocks emit
    // BLOCK-LOCAL coords (origin 0,0) and are seated by a per-block transform applied INSIDE each
    // layer group, so the geometry coordinates themselves are never rotated.
    const baseX = block.rotated ? 0 : block.x;
    const baseY = block.rotated ? 0 : block.y;
    const colX0 = baseX + kerf / 2 + block.leftPad;
    const datumY = baseY + kerf / 2;
    const d = traceColumn(block.ribs, colX0, datumY, params);
    const cx = colX0 + block.widthMax / 2;
    const stackH = (block.ribs.length - 1) * pitch + rib;
    const lc = (block.wallIndex + 3) % 4;
    const rc = block.wallIndex;
    const cutEl =
      `<path data-role="ladder" data-face="${block.face}" data-wall="${block.wallIndex}" ` +
      `data-seg="${block.segIndex}" fill-rule="evenodd" d="${d}"/>`;
    const spine =
      `<line data-role="spine" data-face="${block.face}" data-wall="${block.wallIndex}" ` +
      `x1="${f(cx)}" y1="${f(datumY)}" x2="${f(cx)}" y2="${f(datumY + stackH)}"/>`;
    const blockLabels = block.ribs
      .map((s, j) => {
        const ty = datumY + j * pitch + rib / 2;
        const corner = `L${lc}/R${rc}`;
        return (
          `<text data-role="rib-label" data-index="${s.ribIndex}" data-face="${block.face}" ` +
          `data-wall="${block.wallIndex}" data-corner="${corner}" ` +
          `x="${f(cx)}" y="${f(ty)}" font-size="2.5" text-anchor="middle">` +
          `${s.ribIndex}${block.face} ${corner}</text>`
        );
      })
      .join('');
    if (block.rotated) {
      // SVG rotate(90) is CW: block-local (x,y) -> (-y,x), so the local rib-stack (y in
      // [0, orientedW]) lands in screen X in [-orientedW, 0]; translate(+orientedW,0) re-seats it to
      // [block.x, block.x+orientedW]. orientedW = the stack length (= the swapped contentW). A
      // separate sub-group per layer keeps CUT / FOLD_VALLEY / ENGRAVE distinct (one wrapping group
      // would collapse the 3 layers).
      const orientedW = block.contentW; // swapped: rib-stack length
      const xform = `translate(${f(block.x + orientedW)}, ${f(block.y)}) rotate(90)`;
      cutPaths.push(`<g transform="${xform}">${cutEl}</g>`);
      spines.push(`<g transform="${xform}">${spine}</g>`);
      labels.push(`<g transform="${xform}">${blockLabels}</g>`);
    } else {
      cutPaths.push(cutEl);
      spines.push(spine);
      labels.push(blockLabels);
    }
  }
  const calX = SHEET_MARGIN;
  const calY = bedH - SHEET_MARGIN - CALIBRATION_MM;
  const calSquare =
    `<rect data-role="calibration" x="${f(calX)}" y="${f(calY)}" ` +
    `width="${f(CALIBRATION_MM)}" height="${f(CALIBRATION_MM)}"/>` +
    `<text data-role="calibration-label" x="${f(calX)}" y="${f(calY - 1)}" ` +
    `font-size="3">${CALIBRATION_MM} mm</text>`;
  const mountainGroup = mountains.length
    ? `<g inkscape:groupmode="layer" inkscape:label="${LAYER.FOLD_MOUNTAIN}" ` +
      `stroke="${LAYER_COLORS[LAYER.FOLD_MOUNTAIN]}" fill="none">${mountains.join('')}</g>`
    : '';
  const header =
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" ` +
    `data-sheet="${sheetIndex + 1}" data-sheet-count="${sheetCount}" ` +
    `width="${f(bedW)}mm" height="${f(bedH)}mm" viewBox="0 0 ${f(bedW)} ${f(bedH)}">`;
  const cutGroup =
    `<g inkscape:groupmode="layer" inkscape:label="${cut}" ` +
    `stroke="${LAYER_COLORS[cut]}" fill="none">${cutPaths.join('')}</g>`;
  if (opts.cutOnly) return header + cutGroup + `</svg>`;
  return (
    header +
    cutGroup +
    mountainGroup +
    `<g inkscape:groupmode="layer" inkscape:label="${LAYER.FOLD_VALLEY}" ` +
    `stroke="${LAYER_COLORS[LAYER.FOLD_VALLEY]}" fill="none">${spines.join('')}</g>` +
    `<g inkscape:groupmode="layer" inkscape:label="${LAYER.ENGRAVE}" ` +
    `stroke="${LAYER_COLORS[LAYER.ENGRAVE]}" fill="none">${labels.join('')}${calSquare}</g>` +
    assemblyLegendGroup() +
    `</svg>`
  );
}

/**
 * Bed-sized rib master sheets: the 4 whole walls (uncombined) packed onto 1:1mm bedW x bedH SVGs,
 * tall walls split into bed-height segments, overflow spilling to extra sheets. Each sheet carries
 * a 50mm calibration square. `model` is unused (geometry comes from params).
 * @returns {string[]} one SVG per bed sheet.
 */
export function renderRibMasterSheets(model, params, opts = {}) {
  const sheets = packRibSheets(collectWalls(params), params);
  return sheets.map((s, i) => renderRibSheetSVG(s.blocks, params, i, sheets.length, opts));
}

/**
 * Combined rib-ladder reference drawing (single SVG). Lays the 4 WHOLE walls (W,H,W,H) from the
 * shared fabric-placement foundation as separate, UNCOMBINED columns — no W/H dedupe, no "cut xN"
 * multiplier (that model is retired; the bed-tiled multi-file export is renderRibMasterSheets).
 * Each column is one connected snap-apart lattice (traceColumn) at the shared endMargin datum.
 * @returns {string}
 */
export function renderRibLadderSVG(model, params) {
  const walls = collectWalls(params);
  const { rib, gap, kerf, endMargin } = params;
  const f = fmt;
  const pitch = rib + gap;
  const margin = 5;
  const datum = endMargin;
  const gutter = 10;

  const ribCount = walls.length ? walls[0].ribs.length : 0;
  const allRibs = walls.flatMap((w) => w.ribs);
  const anyLeftApex = allRibs.some((s) => s.points.some((p) => p.x < 0));
  const leftPad = anyLeftApex
    ? Math.max(...allRibs.map((s) => { const la = s.points.find((p) => p.x < 0); return la ? -la.x : 0; }))
    : 0;
  const anyRightApex = allRibs.some((s) => s.points.some((p) => p.x > s.width));
  const rightPad = anyRightApex
    ? Math.max(...allRibs.map((s) => { const ra = s.points.find((p) => p.x > s.width); return ra ? ra.x - s.width : 0; }))
    : 0;

  const cutPaths = [];
  const placed = [];
  let colX0 = margin + kerf / 2 + leftPad;
  let maxRight = 0;
  for (const wall of walls) {
    const width = Math.max(...wall.ribs.map((r) => r.width));
    const d = traceColumn(wall.ribs, colX0, datum, params);
    cutPaths.push(
      `<path data-role="ladder" data-face="${wall.face}" data-wall="${wall.wallIndex}" ` +
        `fill-rule="evenodd" d="${d}"/>`
    );
    placed.push({ face: wall.face, wallIndex: wall.wallIndex, ribs: wall.ribs, x0: colX0, width });
    maxRight = colX0 + width + kerf / 2 + rightPad;
    colX0 = colX0 + width + kerf + gutter + rightPad;
  }

  const w = maxRight + margin;
  const stackH = (ribCount - 1) * pitch + rib;
  const h = datum + stackH + margin + CALIBRATION_MM + margin;
  const cut = LAYER.CUT;

  const spineMarks = placed
    .map((col) => {
      const cx = col.x0 + col.width / 2;
      return (
        `<line data-role="spine" data-face="${col.face}" data-wall="${col.wallIndex}" ` +
        `x1="${f(cx)}" y1="${f(datum)}" x2="${f(cx)}" y2="${f(datum + stackH)}"/>`
      );
    })
    .join('');
  const spineGroup =
    `<g inkscape:groupmode="layer" inkscape:label="${LAYER.FOLD_VALLEY}" ` +
    `stroke="${LAYER_COLORS[LAYER.FOLD_VALLEY]}" fill="none">${spineMarks}</g>`;

  const labelMarks = placed
    .map((col) => {
      const cx = col.x0 + col.width / 2;
      const lc = (col.wallIndex + 3) % 4;
      const rc = col.wallIndex;
      return col.ribs
        .map((s) => {
          const ty = datum + s.ribIndex * pitch + rib / 2;
          const corner = `L${lc}/R${rc}`;
          return (
            `<text data-role="rib-label" data-index="${s.ribIndex}" data-face="${col.face}" ` +
            `data-wall="${col.wallIndex}" data-corner="${corner}" ` +
            `x="${f(cx)}" y="${f(ty)}" font-size="2.5" text-anchor="middle">` +
            `${s.ribIndex}${col.face} ${corner}</text>`
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
    `stroke="${LAYER_COLORS[cut]}" fill="none">${cutPaths.join('')}</g>` +
    spineGroup +
    engraveGroup +
    `</svg>`
  );
}
