import { computeRibCount } from './geometry/metrics.js';

export const DEFAULT_PARAMS = {
  type: 'straight',
  frontW: 150, frontH: 150, rearW: 150, rearH: 150,
  maxDraw: 300, drawFactor: 1.2,
  rib: 12, gap: 2.5, ribCount: null, cornerAllowance: 15,
  glueTab: 10, endMargin: 35,
  fabricThickness: 0.5, ribThickness: 0.4, kerf: 0.15,
  focalLength: 150, opticalOffset: 40, pageSize: 'A4',
};

export const A6_PRESET = { ...DEFAULT_PARAMS, frontW: 160, frontH: 115, rearW: 160, rearH: 115 };

/**
 * Lock rear=front for straight bellows and resolve a null ribCount. Pure (returns a copy).
 * @param {Object} params
 * @returns {Object}
 */
export function normalizeParams(params) {
  const p = { ...params };
  if (p.type === 'straight') {
    p.rearW = p.frontW;
    p.rearH = p.frontH;
  }
  p.ribCount = computeRibCount(p);
  return p;
}
