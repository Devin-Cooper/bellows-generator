// src/geometry/index.js
import { normalizeParams } from '../params.js';
import { buildStraightPattern } from './straight.js';
import { buildTaperedPattern } from './tapered.js';
import { buildFoldModel as buildFoldKinematics } from './fold.js';

/** @param {Object} params @returns {import('./types.js').PatternModel} */
export function buildPatternModel(params) {
  const p = normalizeParams(params);
  if (p.type === 'tapered') return buildTaperedPattern(p);
  return buildStraightPattern(p);
}

/** @param {Object} params @param {number} t @returns {import('./types.js').FoldModel} */
export function buildFoldModel(params, t) {
  return buildFoldKinematics(normalizeParams(params), t);
}
