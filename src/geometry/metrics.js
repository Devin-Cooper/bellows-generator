import { pitch } from '../constants.js';

/**
 * @param {Object} params
 * @returns {number}
 */
export function computeRibCount(params) {
  if (params.ribCount != null) return params.ribCount;
  return Math.round((params.maxDraw * params.drawFactor - params.rib) / pitch(params)) + 1;
}

/**
 * @param {Object} params
 * @returns {import('./types.js').Metrics}
 */
export function computeMetrics(params) {
  const p = pitch(params);
  const ribCount = computeRibCount(params);
  const N = ribCount - 1;
  const flatPleatedLength = p * N + params.rib;
  const usableDraw = params.maxDraw - 2 * p;
  const collapsedThickness = ribCount * (params.ribThickness + params.fabricThickness);
  const magnification = (usableDraw + params.opticalOffset) / params.focalLength - 1;
  const flatSheet = {
    w: 2 * (params.frontW + params.frontH) + params.glueTab,
    h: flatPleatedLength + 2 * params.endMargin,
  };
  // Stiffened (rigid-frame) opening and rib-to-rib corner gap. The fabric tube spans the full
  // frontW×frontH, but each rib is inset by cornerAllowance at BOTH ends of its face, so the
  // stiffened opening is faceDim - 2*cornerAllowance and the gap between two ribs meeting at a
  // corner is 2*cornerAllowance. Surfaced so the UI can show the shrink (a large corner allowance
  // silently eats the opening). rearW/rearH fall back to front for a not-yet-normalized straight.
  const ca = params.cornerAllowance ?? 0;
  const rearW = params.rearW ?? params.frontW;
  const rearH = params.rearH ?? params.frontH;
  const stiffenedOpening = {
    front: { w: params.frontW - 2 * ca, h: params.frontH - 2 * ca },
    rear: { w: rearW - 2 * ca, h: rearH - 2 * ca },
  };
  const cornerGap = 2 * ca;
  const warnings = [];
  if (collapsedThickness > 20) warnings.push('>20mm collapse');
  if (params.kerf >= params.gap) warnings.push('kerf>=gap');
  return {
    N,
    ribCount,
    pitch: p,
    flatPleatedLength,
    usableDraw,
    collapsedThickness,
    flatSheet,
    stiffenedOpening,
    cornerGap,
    magnification,
    warnings,
  };
}
