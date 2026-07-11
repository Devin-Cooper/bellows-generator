import { normalizeParams } from '../params.js';
import { computeRibCount } from './metrics.js';
import { LAYER, WHOLE_STRIP_NOTE } from '../constants.js';
import { computeMetrics } from './metrics.js';
import { computeRibShapes, halfRibPolygon } from './ribShapes.js';

/**
 * Per-face fold-width sequence (rear -> front) for a tapered face: a smooth LINEAR interpolation
 * from the rear opening to the front opening, one width per pleat.
 *
 * HISTORY: this used to add a ±step/2 "two-rib-width" web/hinge wobble on alternate interior pleats,
 * which collapsed adjacent pleats into equal-width PAIRS (a visible staircase, not a smooth taper).
 * That wobble tied its amplitude to the taper RATE (step) rather than to the pleat geometry, and its
 * "even index = web = mountain" justification was ill-posed: a rib is one rigid loop, so a single
 * per-rib scalar width cannot encode a mountain/valley alternation that flips per WALL (the fold M/V
 * parity is (pleat+column); the interlock parity is (wall+rib)). It was only ever gated by a
 * SELF-DERIVED fixture (tests/fixtures/photrio.js), never a real Photrio run or paper fold. If a
 * genuine mountain-ring/valley-ring diameter alternation turns out to be real, re-derive it from the
 * nested-frustum fold-vertex projection (two interleaved MONOTONE sequences with a geometry-based
 * amplitude), NOT a ±step/2 wobble about the linear mean.
 * @param {number} rear
 * @param {number} front
 * @param {number} N  pleat/gap count (= ribCount - 1)
 * @returns {number[]} length N+1
 */
function faceFoldWidths(rear, front, N) {
  if (N <= 0) return [rear];
  const step = (rear - front) / N;
  const out = [];
  for (let i = 0; i <= N; i++) out.push(rear - step * i);
  return out;
}

/**
 * @param {import('./types.js').PatternParams|Object} params
 * @returns {{ width:number[], height:number[] }}
 */
export function computeFaceFoldWidths(params) {
  const p = normalizeParams(params);
  const N = computeRibCount(p) - 1;
  return {
    width: faceFoldWidths(p.rearW, p.frontW, N),
    height: faceFoldWidths(p.rearH, p.frontH, N),
  };
}

/**
 * Tapered flat pattern: five columns (halfW | H | W | H | halfW) laid so ADJACENT FACES ABUT along
 * a shared, SLANTING corner edge — the pleat band narrows rear (top) -> front (bottom) and is centred
 * on the sheet centreline, so the rib-to-rib corner gap stays a CONSTANT 2*cornerAllowance at every
 * pleat (interlock corner half-points register front-to-rear). Emits transverse rib footprints
 * (ENGRAVE), transverse creases (M/V by (pleat+column) parity) across each clear zone, slanting
 * longitudinal corner folds, 45deg corner miters, a seam-following glue tab, and end margins. The
 * outer CUT is the resulting symmetric taper trapezoid (full-width end-margin bands + tab).
 *
 * HISTORY: faces used to be fixed-rear-centre vertical columns, so they DIVERGED toward the front —
 * the corner gap ballooned (~30mm rear -> ~85mm front) and interlock corners stopped registering.
 * The linear fold-width sequence makes every band edge a straight line, so the corners slant linearly.
 * @param {Object} params
 * @returns {import('./types.js').PatternModel}
 */
export function buildTaperedPattern(params) {
  const p = normalizeParams(params);
  const metrics = computeMetrics(p);
  const n = metrics.ribCount;
  const N = metrics.N;
  const pit = metrics.pitch;
  const ca = p.cornerAllowance;
  const rib = p.rib;
  const gap = p.gap;
  const endMargin = p.endMargin;
  const tab = p.glueTab;
  const { width: wFold, height: hFold } = computeFaceFoldWidths(p);

  const pleatedLength = metrics.flatPleatedLength;
  const flatH = pleatedLength + 2 * endMargin;
  const flatW = 2 * p.rearW + 2 * p.rearH + tab; // rear (widest) band + tab -> bounds width unchanged

  const faceKinds = ['W', 'H', 'W', 'H', 'W']; // columns 0 & 4 are half of one W seam face
  // clear-zone insets [left, right]: seam edges (col0 left, col4 right) get 0, corner edges get ca.
  const faceInsets = [[0, ca], [ca, ca], [ca, ca], [ca, ca], [ca, 0]];

  // ---- per-pleat column layout (each band centred on Xc; adjacent faces share their edge) ----
  const colW = (c, i) => {
    const full = faceKinds[c] === 'W' ? wFold[i] : hFold[i];
    return (c === 0 || c === 4) ? full / 2 : full; // edge columns are half a W face
  };
  const totalAt = (i) => 2 * wFold[i] + 2 * hFold[i]; // the 5 columns sum to the full band width
  const Xc = totalAt(0) / 2;                          // sheet centreline (rear band spans [0, 2W+2H])
  const colLeft = (c, i) => {
    let x = Xc - totalAt(i) / 2;                      // band centred -> left edge slants inward
    for (let k = 0; k < c; k++) x += colW(k, i);
    return x;
  };
  const colRight = (c, i) => colLeft(c, i) + colW(c, i);
  const colCenter = (c, i) => colLeft(c, i) + colW(c, i) / 2;
  const creaseY = (i) => endMargin + i * pit + rib + gap / 2; // transverse fold at the gap centre

  const segments = [];
  const regions = [];
  const ribShapes = computeRibShapes(p);
  const shapeFor = (kind, i) => ribShapes.find((s) => s.face === kind && s.ribIndex === i);

  // transverse rib footprints (ENGRAVE): the canonical inset rib polygons from computeRibShapes,
  // positioned on the per-pleat layout. Full columns centre their clear width on the column
  // centreline; the split-W edge columns sit seam-flush (col0 seam at its left edge, col4 seam at
  // its right edge). shape.points already carry interlock point/notch ends, so they flow through.
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < faceKinds.length; c++) {
      const shape = shapeFor(faceKinds[c], i);
      const isHalf = c === 0 || c === 4;
      const poly = isHalf ? halfRibPolygon(shape, c === 0 ? 'right' : 'left') : shape.points;
      const ox = isHalf
        ? (c === 0 ? colLeft(0, i) : colRight(4, i) - shape.width / 2) // seam-flush half strip
        : colCenter(c, i) - shape.width / 2;                          // centre the full face
      const oy = endMargin + shape.yBand.y0; // fabric endMargin datum
      segments.push({
        type: LAYER.ENGRAVE, layer: LAYER.ENGRAVE, closed: true,
        points: poly.map((pt) => ({ x: ox + pt.x, y: oy + pt.y })),
        ...(isHalf ? { annotation: WHOLE_STRIP_NOTE } : {}),
      });
    }
  }

  // fold lines at gap centres: transverse creases across each clear zone (M/V by (pleat+column)
  // parity) + a symmetric 45deg corner miter at each internal boundary, mirroring straight.js. All x
  // use the per-pleat layout, so the corners land on the shared slanting seam and register.
  const reachM = Math.min(ca, pit / 2); // 45deg crease, rise 2*reach <= pitch
  for (let i = 0; i < N; i++) {
    const y = creaseY(i);
    for (let c = 0; c < faceKinds.length; c++) {
      const [insetL, insetR] = faceInsets[c];
      // clear-zone ends averaged across pleats i and i+1 (the crease sits at their gap centre)
      const zoneL = (colLeft(c, i) + colLeft(c, i + 1)) / 2 + insetL;
      const zoneR = (colRight(c, i) + colRight(c, i + 1)) / 2 - insetR;
      const type = (i + c) % 2 === 0 ? LAYER.FOLD_MOUNTAIN : LAYER.FOLD_VALLEY;
      segments.push({ type, layer: type, closed: false, points: [{ x: zoneL, y }, { x: zoneR, y }] });
    }
    // corner miters at the 4 internal boundaries (col c | col c+1), centred on the shared corner edge
    for (let c = 0; c < faceKinds.length - 1; c++) {
      const bx = (colRight(c, i) + colRight(c, i + 1)) / 2; // = shared corner edge at the crease
      const type = (i + c) % 2 === 0 ? LAYER.FOLD_MOUNTAIN : LAYER.FOLD_VALLEY;
      const dir = type === LAYER.FOLD_MOUNTAIN ? 1 : -1;
      segments.push({
        type, layer: type, closed: false,
        points: [{ x: bx - reachM, y: y - dir * reachM }, { x: bx + reachM, y: y + dir * reachM }],
      });
    }
  }

  // slanting longitudinal tube-corner folds (mountain), rear boundary -> front boundary
  for (let c = 0; c < faceKinds.length - 1; c++) {
    segments.push({
      type: LAYER.FOLD_MOUNTAIN, layer: LAYER.FOLD_MOUNTAIN, closed: false,
      points: [
        { x: colRight(c, 0), y: endMargin },
        { x: colRight(c, n - 1), y: endMargin + pleatedLength },
      ],
    });
  }

  // ---- outer CUT boundary: symmetric taper trapezoid, full-width end-margin bands, seam tab ----
  const yT = endMargin, yB = endMargin + pleatedLength;
  const Lr = Xc - totalAt(0) / 2, Rr = Xc + totalAt(0) / 2;       // rear band edges (= 0 and 2W+2H)
  const Lf = Xc - totalAt(n - 1) / 2, Rf = Xc + totalAt(n - 1) / 2; // front band edges
  segments.push({
    type: LAYER.CUT, layer: LAYER.CUT, closed: true,
    points: [
      { x: Lr, y: 0 }, { x: Rr, y: 0 },       // rear margin (full rear width)
      { x: Rr, y: yT },                        // down the rear-margin right edge
      { x: Rr + tab, y: yT },                  // out to the glue tab (follows the seam edge)
      { x: Rf + tab, y: yB },
      { x: Rf, y: yB },                        // back in from the tab
      { x: Rf, y: flatH }, { x: Lf, y: flatH }, // front margin (full front width)
      { x: Lf, y: yB },                        // up the front-margin left edge
      { x: Lr, y: yT },                        // slanting left pleat edge back to the rear margin
    ],
  });
  // glue-tab fold line = the seam edge (col4 right, slanting) over the pleated region
  segments.push({
    type: LAYER.GLUE_TAB, layer: LAYER.GLUE_TAB, closed: false,
    points: [{ x: Rr, y: yT }, { x: Rf, y: yB }],
  });

  // regions (rear-based extents for preview/labels)
  for (let c = 0; c < faceKinds.length; c++) {
    regions.push({
      kind: c === 0 || c === 4 ? 'HALF_FACE' : 'FACE', faceIndex: c,
      bbox: { x: colLeft(c, 0), y: endMargin, w: colW(c, 0), h: pleatedLength },
    });
    if (c < faceKinds.length - 1) {
      regions.push({
        kind: 'CORNER_MITER', faceIndex: c,
        bbox: { x: colRight(c, 0), y: endMargin, w: 0, h: pleatedLength },
      });
    }
  }
  regions.push({ kind: 'GLUE_TAB', faceIndex: 4, bbox: { x: Rr, y: yT, w: tab, h: pleatedLength } });
  regions.push({ kind: 'END_MARGIN', faceIndex: -1, bbox: { x: Lr, y: 0, w: totalAt(0), h: endMargin } });
  regions.push({ kind: 'END_MARGIN', faceIndex: -1, bbox: { x: Lf, y: flatH - endMargin, w: totalAt(n - 1), h: endMargin } });

  return { segments, regions, seamFaceIndex: 4, bounds: { w: flatW, h: flatH }, metrics };
}
