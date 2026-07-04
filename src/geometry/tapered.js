import { normalizeParams } from '../params.js';
import { computeRibCount } from './metrics.js';
import { LAYER } from '../constants.js';
import { computeMetrics } from './metrics.js';

/**
 * Per-face fold-width sequence (rear -> front) for a tapered face.
 * Two-rib-width construction: interior ribs alternate web (mountain, even index,
 * bulged outward) and hinge (valley, odd index, tucked inward) by half a taper step,
 * so the sequence is NOT a single monotonic interpolation. Endpoints are clamped to
 * the true opening dimensions (mounting frames, not folds). Empirically gated against
 * the Photrio fixtures + a printed paper fold — not a proven closed-form.
 * @param {number} rear
 * @param {number} front
 * @param {number} N  pleat/gap count (= ribCount - 1)
 * @returns {number[]} length N+1
 */
function faceFoldWidths(rear, front, N) {
  if (N <= 0) return [rear];
  const step = (rear - front) / N;
  const out = [];
  for (let i = 0; i <= N; i++) {
    if (i === 0) { out.push(rear); continue; }
    if (i === N) { out.push(front); continue; }
    const base = rear - step * i;
    const offset = (i % 2 === 0) ? step / 2 : -step / 2;
    out.push(base + offset);
  }
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

  // transverse rib footprints (ENGRAVE registration outlines)
  for (let i = 0; i < n; i++) {
    const y = p.endMargin + i * pit + p.rib / 2;
    for (let c = 0; c < faceKinds.length; c++) {
      const half = colFold(c, i) / 2;
      segments.push({
        type: LAYER.ENGRAVE, layer: LAYER.ENGRAVE, closed: false,
        points: [{ x: centers[c] - half, y }, { x: centers[c] + half, y }],
      });
    }
  }

  // fold lines at gap centers: M/V alternates along draw AND inverts across faces
  for (let i = 0; i < N; i++) {
    const y = p.endMargin + i * pit + p.rib + p.gap / 2;
    for (let c = 0; c < faceKinds.length; c++) {
      const half = ((colFold(c, i) + colFold(c, i + 1)) / 2) / 2;
      const type = ((i + c) % 2 === 0) ? LAYER.FOLD_MOUNTAIN : LAYER.FOLD_VALLEY;
      segments.push({
        type, layer: type, closed: false,
        points: [{ x: centers[c] - half, y }, { x: centers[c] + half, y }],
      });
      // variable-angle corner-miter diagonal at each face boundary
      if (c < faceKinds.length - 1) {
        const edgeX = centers[c] + colFold(c, i) / 2;
        segments.push({
          type: LAYER.FOLD_VALLEY, layer: LAYER.FOLD_VALLEY, closed: false,
          points: [{ x: edgeX, y: y - p.gap / 2 }, { x: centers[c] + half, y }],
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
