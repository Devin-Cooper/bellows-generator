import { describe, it, expect } from 'vitest';
import { computeRibShapes, halfRibPolygon } from '../src/geometry/ribShapes.js';
import { computeRibOutlines, computeFullRibOutlines } from '../src/export/stl.js';
import { normalizeParams, DEFAULT_PARAMS } from '../src/params.js';

const P = (o = {}) => normalizeParams({ ...DEFAULT_PARAMS, frontW: 160, frontH: 160, cornerMode: 'interlock-full', cornerAllowance: 5, rib: 12, ...o });

describe('interlock-full consumers', () => {
  it('STL rib outlines triangulate the 6-vertex hexagon without error', () => {
    const solids = computeRibOutlines({}, P());
    expect(solids.some((s) => s.kind === 'rib')).toBe(true);
    const full = computeFullRibOutlines({}, P());
    expect(Array.isArray(full) ? full.length : (full.solids || full).length).toBeGreaterThan(0);
  });
  it('halfRibPolygon carries the outer fold-hug vertex for an interlock-full split-W rib', () => {
    // pick a split-W rib with a hexagon (6-vertex) full shape, ask for its OUTER half
    const shapes = computeRibShapes(P());
    const w0 = shapes.find((s) => s.wallIndex === 0 && s.points.length === 6);
    expect(w0).toBeTruthy();
    const half = halfRibPolygon(w0, 'right'); // outer end toward the corner for col 0
    // the half footprint's outer end must include a mid-band vertex (0 < y < depth), not a flat trapezoid
    const depth = w0.yBand.y1 - w0.yBand.y0;
    expect(half.some((p) => p.y > 1e-6 && p.y < depth - 1e-6)).toBe(true);
  });
});
