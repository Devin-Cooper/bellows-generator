import { normalizeParams } from '../params.js';
import { computeRibCount } from './metrics.js';

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
