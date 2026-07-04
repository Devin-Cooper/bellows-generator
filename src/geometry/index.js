// src/geometry/index.js
import { normalizeParams } from '../params.js';
import { buildStraightPattern } from './straight.js';

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
