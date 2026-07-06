import { LAYER, LAYER_COLORS } from '../constants.js';
import { computeWallRibLayout } from '../geometry/wallRibLayout.js';

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
  const plan = planBedTiles(model.bounds, params);
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
      `<g clip-path="url(#bed)"><g transform="translate(${fmt(-t.x)},${fmt(-t.y)})">\n` +
      groups +
      `\n` + gapAnno +
      `\n</g></g>\n` +
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
  const budget = Math.max(rib, usableH - kerf);             // vertical rib-stack budget per segment

  // (1) Y-split walls into segment blocks (mirrors stl.js computeRibOutlines bed-wrap).
  const blocks = [];
  for (const wall of walls) {
    const ribs = wall.ribs;
    if (!ribs.length) continue;
    const widthMax = Math.max(...ribs.map((r) => r.width));
    const leftPad = Math.max(0, ...ribs.map((r) => -Math.min(...r.points.map((p) => p.x))));
    const rightPad = Math.max(0, ...ribs.map((r) => Math.max(...r.points.map((p) => p.x)) - r.width));
    const contentW = kerf + leftPad + widthMax + rightPad;

    // A rib cannot be split across its WIDTH (only its height is bed-wrapped), so a wall wider than
    // the usable bed width overruns the sheet unavoidably. Warn (once per wall) but still emit the
    // sheet — the geometry is correct, only the chosen bed is too narrow to cut it in one piece.
    if (contentW > usableW) {
      console.warn(
        `Rib wall ${wall.face}${wall.wallIndex} width ${contentW.toFixed(1)}mm exceeds ` +
          `usable bed width ${usableW.toFixed(1)}mm; increase bedW or reduce the opening`
      );
    }

    let segStart = 0;
    let segIndex = 0;
    while (segStart < ribs.length) {
      let segLen = 0;
      let segEnd = segStart;
      while (segEnd < ribs.length) {
        const add = segEnd === segStart ? rib : gap + rib;
        if (segEnd > segStart && segLen + add > budget) break;
        segLen += add;
        segEnd++;
      }
      const segRibs = ribs.slice(segStart, segEnd);
      const contentH = kerf + (segRibs.length - 1) * pitch + rib;
      blocks.push({
        face: wall.face, wallIndex: wall.wallIndex, segIndex,
        ribs: segRibs, widthMax, leftPad, rightPad, contentW, contentH,
      });
      segStart = segEnd;
      segIndex++;
    }
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

/** One bed sheet: packed lattices (CUT) + spine scores (FOLD_VALLEY) + rib labels & calibration (ENGRAVE). */
export function renderRibSheetSVG(blocks, params, sheetIndex, sheetCount) {
  const { rib, gap, kerf, bedW, bedH } = params;
  const pitch = rib + gap;
  const f = fmt;
  const cut = LAYER.CUT;
  const cutPaths = [];
  const spines = [];
  const labels = [];
  for (const block of blocks) {
    const colX0 = block.x + kerf / 2 + block.leftPad;
    const datumY = block.y + kerf / 2;
    const d = traceColumn(block.ribs, colX0, datumY, params);
    cutPaths.push(
      `<path data-role="ladder" data-face="${block.face}" data-wall="${block.wallIndex}" ` +
        `data-seg="${block.segIndex}" fill-rule="evenodd" d="${d}"/>`
    );
    const cx = colX0 + block.widthMax / 2;
    const stackH = (block.ribs.length - 1) * pitch + rib;
    spines.push(
      `<line data-role="spine" data-face="${block.face}" data-wall="${block.wallIndex}" ` +
        `x1="${f(cx)}" y1="${f(datumY)}" x2="${f(cx)}" y2="${f(datumY + stackH)}"/>`
    );
    const lc = (block.wallIndex + 3) % 4;
    const rc = block.wallIndex;
    block.ribs.forEach((s, j) => {
      const ty = datumY + j * pitch + rib / 2;
      const corner = `L${lc}/R${rc}`;
      labels.push(
        `<text data-role="rib-label" data-index="${s.ribIndex}" data-face="${block.face}" ` +
          `data-wall="${block.wallIndex}" data-corner="${corner}" ` +
          `x="${f(cx)}" y="${f(ty)}" font-size="2.5" text-anchor="middle">` +
          `${s.ribIndex}${block.face} ${corner}</text>`
      );
    });
  }
  const calX = SHEET_MARGIN;
  const calY = bedH - SHEET_MARGIN - CALIBRATION_MM;
  const calSquare =
    `<rect data-role="calibration" x="${f(calX)}" y="${f(calY)}" ` +
    `width="${f(CALIBRATION_MM)}" height="${f(CALIBRATION_MM)}"/>` +
    `<text data-role="calibration-label" x="${f(calX)}" y="${f(calY - 1)}" ` +
    `font-size="3">${CALIBRATION_MM} mm</text>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" ` +
    `data-sheet="${sheetIndex + 1}" data-sheet-count="${sheetCount}" ` +
    `width="${f(bedW)}mm" height="${f(bedH)}mm" viewBox="0 0 ${f(bedW)} ${f(bedH)}">` +
    `<g inkscape:groupmode="layer" inkscape:label="${cut}" ` +
    `stroke="${LAYER_COLORS[cut]}" fill="none">${cutPaths.join('')}</g>` +
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
export function renderRibMasterSheets(model, params) {
  const sheets = packRibSheets(collectWalls(params), params);
  return sheets.map((s, i) => renderRibSheetSVG(s.blocks, params, i, sheets.length));
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
