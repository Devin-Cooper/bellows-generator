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
 * Tapered flat pattern: five columns (halfW | H | W | H | halfW), each a trapezoid
 * narrowing rear (top) -> front (bottom). Transverse rib footprints (ENGRAVE), fold
 * lines (M/V alternating along the draw and inverting across faces), variable-angle
 * corner-miter diagonals, glue tab, and end margins. The gated quantity is the per-rib
 * face fold-width (computeFaceFoldWidths); the outline is structural for preview/export.
 * @param {Object} params
 * @returns {import('./types.js').PatternModel}
 */
export function buildTaperedPattern(params) {
  const p = normalizeParams(params);
  const metrics = computeMetrics(p);
  const n = metrics.ribCount;
  const N = metrics.N;
  const pit = metrics.pitch;
  const { width: wFold, height: hFold } = computeFaceFoldWidths(p);

  const tab = p.glueTab;
  const flatW = 2 * p.rearW + 2 * p.rearH + tab;
  const flatH = metrics.flatPleatedLength + 2 * p.endMargin;

  const faceKinds = ['W', 'H', 'W', 'H', 'W']; // columns 0 & 4 are half of one W face
  const rearCol = [p.rearW / 2, p.rearH, p.rearW, p.rearH, p.rearW / 2];
  const centers = [];
  let cx = 0;
  for (let c = 0; c < rearCol.length; c++) { centers.push(cx + rearCol[c] / 2); cx += rearCol[c]; }

  const colFold = (c, i) => {
    const full = faceKinds[c] === 'W' ? wFold[i] : hFold[i];
    return (c === 0 || c === 4) ? full / 2 : full;
  };

  const segments = [];
  const regions = [];

  const ribShapes = computeRibShapes(p);
  const shapeFor = (kind, i) => ribShapes.find((s) => s.face === kind && s.ribIndex === i);

  // transverse rib footprints (ENGRAVE): true INSET polygons per pleat, re-derived from
  // computeRibShapes (fixes P3b's open centreline ticks). width = per-pleat faceWidth - 2*ca
  // from the engine (honours taper); the split-W edge columns (0 & 4) show shape.width/2.
  // Polygons are centred on the rear-based column centre, matching the existing trapezoid
  // layout, and use the engine yBand PLUS the endMargin origin so they register to the
  // ladder. Footprints already route shape.points so interlock point/notch ends flow through.
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < faceKinds.length; c++) {
      const shape = shapeFor(faceKinds[c], i);
      const isHalf = c === 0 || c === 4;
      const poly = isHalf ? halfRibPolygon(shape, c === 0 ? 'right' : 'left') : shape.points;
      const ribW = isHalf ? shape.width / 2 : shape.width;
      const ox = centers[c] - ribW / 2;       // left origin so the footprint is centred
      const oy = p.endMargin + shape.yBand.y0; // fabric endMargin datum
      segments.push({
        type: LAYER.ENGRAVE,
        layer: LAYER.ENGRAVE,
        closed: true,
        points: poly.map((pt) => ({ x: ox + pt.x, y: oy + pt.y })),
        // Split-W halves (cols 0 & 4) are one whole strip, not two cut pieces — flag them.
        ...(isHalf ? { annotation: WHOLE_STRIP_NOTE } : {}),
      });
    }
  }

  // fold lines at gap centers: transverse creases (M/V by (pleat+column) parity) + a 45deg corner
  // miter at each internal face boundary. Mirrors straight.js's proven construction (the tapered
  // path used to draw a one-sided, hardcoded-VALLEY, half-gap edge-tracing stub).
  const reach = Math.min(p.cornerAllowance, pit / 2); // 45deg crease, rise 2*reach <= pitch
  for (let i = 0; i < N; i++) {
    const y = p.endMargin + i * pit + p.rib + p.gap / 2;
    for (let c = 0; c < faceKinds.length; c++) {
      const half = ((colFold(c, i) + colFold(c, i + 1)) / 2) / 2;
      const type = ((i + c) % 2 === 0) ? LAYER.FOLD_MOUNTAIN : LAYER.FOLD_VALLEY;
      segments.push({
        type, layer: type, closed: false,
        points: [{ x: centers[c] - half, y }, { x: centers[c] + half, y }],
      });
      // 45deg corner-miter diagonal at each internal boundary (cols 0..3 -> the 4 tube corners),
      // centred on the per-pleat corner (midpoint of the two facing face edges at this crease) and
      // sharing the crease's M/V + tilt parity — corner index == column index c here, so straight.js's
      // corner rule mountain=((i+c)%2==0) reuses `type`. NOTE (provisional / paper-fold-gated): the
      // corner line is seated at the rear-based boundary; a true taper's corner fold SLANTS rear->front
      // as the faces recede — that refinement is deferred to a printed-fold gate.
      if (c < faceKinds.length - 1) {
        const halfNext = ((colFold(c + 1, i) + colFold(c + 1, i + 1)) / 2) / 2;
        const cornerMid = ((centers[c] + half) + (centers[c + 1] - halfNext)) / 2;
        const dir = type === LAYER.FOLD_MOUNTAIN ? 1 : -1;
        segments.push({
          type, layer: type, closed: false,
          points: [
            { x: cornerMid - reach, y: y - dir * reach },
            { x: cornerMid + reach, y: y + dir * reach },
          ],
        });
      }
    }
  }

  // FACE / CORNER_MITER regions
  for (let c = 0; c < faceKinds.length; c++) {
    const bw = Math.max(colFold(c, 0), colFold(c, n - 1));
    regions.push({
      kind: (c === 0 || c === 4) ? 'HALF_FACE' : 'FACE', faceIndex: c,
      bbox: { x: centers[c] - bw / 2, y: p.endMargin, w: bw, h: metrics.flatPleatedLength },
    });
    if (c < faceKinds.length - 1) {
      regions.push({
        kind: 'CORNER_MITER', faceIndex: c,
        bbox: { x: centers[c], y: p.endMargin, w: 0, h: metrics.flatPleatedLength },
      });
    }
  }
  regions.push({ kind: 'GLUE_TAB', faceIndex: 4, bbox: { x: flatW - tab, y: p.endMargin, w: tab, h: metrics.flatPleatedLength } });
  regions.push({ kind: 'END_MARGIN', faceIndex: -1, bbox: { x: 0, y: 0, w: flatW, h: p.endMargin } });
  regions.push({ kind: 'END_MARGIN', faceIndex: -1, bbox: { x: 0, y: flatH - p.endMargin, w: flatW, h: p.endMargin } });

  // outer CUT boundary + glue-tab cut
  segments.push({
    type: LAYER.CUT, layer: LAYER.CUT, closed: true,
    points: [{ x: 0, y: 0 }, { x: flatW, y: 0 }, { x: flatW, y: flatH }, { x: 0, y: flatH }],
  });
  segments.push({
    type: LAYER.GLUE_TAB, layer: LAYER.GLUE_TAB, closed: true,
    points: [
      { x: flatW - tab, y: p.endMargin }, { x: flatW, y: p.endMargin },
      { x: flatW, y: flatH - p.endMargin }, { x: flatW - tab, y: flatH - p.endMargin },
    ],
  });

  return { segments, regions, seamFaceIndex: 4, bounds: { w: flatW, h: flatH }, metrics };
}
