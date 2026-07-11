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

/** Returns true when the mesh is a consistently-oriented closed manifold:
 *  every directed edge (u->v) appears exactly once, and its reverse (v->u)
 *  also appears exactly once. Detects flipped caps that the undirected
 *  edge-manifold test cannot catch.
 */
function isOrientedManifold(indices) {
  const dir = new Map();
  const k = (a, b) => `${a}_${b}`;
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i], indices[i + 1], indices[i + 2]];
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      dir.set(k(u, v), (dir.get(k(u, v)) || 0) + 1);
    }
  }
  for (const [key, n] of dir) {
    if (n !== 1) return false;                          // each directed edge exactly once
    const [u, v] = key.split('_');
    if ((dir.get(k(v, u)) || 0) !== 1) return false;   // its reverse exactly once
  }
  return true;
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

  it('produces a consistently-oriented closed manifold (outward-facing caps) at every extension', () => {
    for (const t of [0, 0.5, 1]) {
      const m = buildFoldModel(DEFAULT_PARAMS, t);
      expect(isOrientedManifold(m.indices)).toBe(true);
    }
  });

  // Regression: the octagon corner chamfer must represent the folded corner crease (small), NOT the
  // full unstiffened corner allowance — otherwise a big corner allowance collapses the preview
  // cross-section toward the stiffened-rib width and a 100×100 tube reads as ~70×70. Ring-0 (rib
  // ring, no bulge) vertices 0 and 1 are the two ends of the −y flat facet.
  const facetWidth = (m) => m.positions[1 * 3] - m.positions[0 * 3]; // x1 − x0 on ring 0
  const bboxWidth = (m) => {
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < 8 * 3; i += 3) { min = Math.min(min, m.positions[i]); max = Math.max(max, m.positions[i]); }
    return max - min;
  };

  it('keeps the octagon bounding box at the full front opening regardless of corner allowance', () => {
    for (const ca of [2, 15, 40]) {
      const m = buildFoldModel({ ...DEFAULT_PARAMS, frontW: 100, frontH: 100, cornerAllowance: ca }, 1);
      expect(bboxWidth(m)).toBeCloseTo(100, 6);
    }
  });

  it('caps the corner chamfer at pitch/2 so a large allowance no longer shrinks the facet to the rib width', () => {
    const p = computeMetrics({ ...DEFAULT_PARAMS, frontW: 100, frontH: 100 });
    // Small allowance: facet ≈ full opening minus a couple mm.
    const small = buildFoldModel({ ...DEFAULT_PARAMS, frontW: 100, frontH: 100, cornerAllowance: 2 }, 1);
    expect(facetWidth(small)).toBeCloseTo(100 - 2 * 2, 6); // 96
    // Large allowance: chamfer is capped at pitch/2, NOT the old 100 − 2·15 = 70.
    const large = buildFoldModel({ ...DEFAULT_PARAMS, frontW: 100, frontH: 100, cornerAllowance: 15 }, 1);
    expect(facetWidth(large)).toBeCloseTo(100 - 2 * (p.pitch / 2), 6); // 85.5
    expect(facetWidth(large)).toBeGreaterThan(70);
  });
});
