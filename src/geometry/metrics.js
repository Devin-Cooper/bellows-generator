import { pitch } from '../constants.js';

/**
 * @param {Object} params
 * @returns {number}
 */
export function computeRibCount(params) {
  if (params.ribCount != null) return params.ribCount;
  return Math.round((params.maxDraw * params.drawFactor - params.rib) / pitch(params)) + 1;
}
