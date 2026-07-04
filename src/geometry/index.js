// src/geometry/index.js
import { normalizeParams } from '../params.js';
import { buildStraightPattern } from './straight.js';
import { buildFoldModel as buildStraightFoldModel } from './fold.js';

/**
 * Build the flat PatternModel, dispatching by bellows type. Normalizes first.
 * @param {Object} params
 * @returns {import('./types.js').PatternModel}
 */
export function buildPatternModel(params) {
  const norm = normalizeParams(params);
  if (norm.type === 'tapered') {
    throw new Error('tapered pattern not yet implemented');
  }
  return buildStraightPattern(norm);
}

/**
 * Build the folded 3D shell, dispatching by params.type.
 * Tapered kinematics are layered in later; both types currently share the
 * straight pleated-ring builder.
 * @param {object} params
 * @param {number} t extension in [0,1]
 * @returns {import('./types.js').FoldModel}
 */
export function buildFoldModel(params, t) {
  return buildStraightFoldModel(params, t);
}
