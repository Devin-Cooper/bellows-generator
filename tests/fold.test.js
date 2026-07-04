// tests/fold.test.js
import { describe, it, expect } from 'vitest';
import { buildFoldModel } from '../src/geometry/fold.js';
import { computeMetrics } from '../src/geometry/metrics.js';
import { DEFAULT_PARAMS } from '../src/params.js';

/** Returns true when every undirected edge is shared by exactly two triangles. */
function isEdgeManifold(indices) {
  const counts = new Map();
  const key = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i];
    const b = indices[i + 1];
    const c = indices[i + 2];
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const k = key(u, v);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  }
  return [...counts.values()].every((n) => n === 2);
}

function zExtent(positions) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 2; i < positions.length; i += 3) {
    if (positions[i] < min) min = positions[i];
    if (positions[i] > max) max = positions[i];
  }
  return max - min;
}

describe('buildFoldModel', () => {
  const metrics = computeMetrics(DEFAULT_PARAMS);
  const ringCount = 2 * metrics.ribCount - 1;

  it('collapses to ribCount*(ribThickness+fabricThickness) at t=0', () => {
    const m = buildFoldModel(DEFAULT_PARAMS, 0);
    expect(m.axialLength).toBeCloseTo(metrics.collapsedThickness, 6);
    expect(m.axialLength).toBeCloseTo(zExtent(m.positions), 6);
    expect(m.extension).toBe(0);
  });

  it('extends to the usable draw at t=1', () => {
    const m = buildFoldModel(DEFAULT_PARAMS, 1);
    expect(m.axialLength).toBeCloseTo(metrics.usableDraw, 6);
    expect(m.axialLength).toBeCloseTo(zExtent(m.positions), 6);
    expect(m.extension).toBe(1);
  });

  it('interpolates axial length linearly and clamps t', () => {
    const half = buildFoldModel(DEFAULT_PARAMS, 0.5).axialLength;
    const mid = (metrics.collapsedThickness + metrics.usableDraw) / 2;
    expect(half).toBeCloseTo(mid, 6);
    expect(buildFoldModel(DEFAULT_PARAMS, -3).axialLength).toBeCloseTo(
      metrics.collapsedThickness,
      6,
    );
    expect(buildFoldModel(DEFAULT_PARAMS, 9).axialLength).toBeCloseTo(
      metrics.usableDraw,
      6,
    );
  });

  it('emits 8 vertices per ring across rib and ridge rings', () => {
    const m = buildFoldModel(DEFAULT_PARAMS, 0.5);
    expect(m.positions.length).toBe(3 * 8 * ringCount);
    expect(m.indices.length).toBe(3 * (16 * (ringCount - 1) + 12));
  });

  it('produces a closed edge-manifold mesh at every extension', () => {
    for (const t of [0, 0.5, 1]) {
      const m = buildFoldModel(DEFAULT_PARAMS, t);
      expect(isEdgeManifold(m.indices)).toBe(true);
    }
  });
});
