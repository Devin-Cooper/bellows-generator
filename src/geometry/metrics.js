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
    magnification,
    warnings,
  };
}
