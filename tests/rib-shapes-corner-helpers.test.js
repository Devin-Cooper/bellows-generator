import { describe, it, expect } from 'vitest';
import {
  cornerPointReach,
  cornerNotchDepth,
  CORNER_CLEARANCE,
  ribPolygon,
} from '../src/geometry/ribShapes.js';

describe('cornerPointReach (PROVISIONAL 45deg bevel reach)', () => {
  it('is depth/2 (exact 45deg) when depth/2 <= cornerAllowance', () => {
    expect(cornerPointReach(12, 15)).toBe(6);
  });
  it('clamps to cornerAllowance so the apex never crosses the corner line', () => {
    expect(cornerPointReach(40, 15)).toBe(15);
  });
});

describe('cornerNotchDepth (PROVISIONAL clearance gap)', () => {
  it('is reach + clearance (notch cut deeper than the mating point by the clearance)', () => {
    expect(cornerNotchDepth(6)).toBeCloseTo(6 + CORNER_CLEARANCE, 6);
  });
  it('default clearance is small and non-negative', () => {
    expect(CORNER_CLEARANCE).toBeGreaterThanOrEqual(0);
    expect(CORNER_CLEARANCE).toBeLessThanOrEqual(2);
  });
  it('accepts an explicit clearance override', () => {
    expect(cornerNotchDepth(6, 1)).toBe(7);
  });
});

describe('ribPolygon', () => {
  it('flat ends -> the 4-point inset rectangle', () => {
    const pts = ribPolygon(120, 12, { leftKind: 'flat', rightKind: 'flat' }, 6, 6.5);
    expect(pts).toEqual([
      { x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 12 }, { x: 0, y: 12 },
    ]);
  });

  it('point ends -> 6 points; convex apexes reach past BOTH inset edges (construction rule)', () => {
    const pts = ribPolygon(120, 12, { leftKind: 'point', rightKind: 'point' }, 6, 6.5);
    expect(pts.length).toBe(6);
    const right = pts.find((p) => p.x > 120);
    const left = pts.find((p) => p.x < 0);
    expect(right.x - 120).toBe(6); // reach past the right edge
    expect(right.y).toBe(6);       // apex on the y-midline
    expect(left.x).toBe(-6);       // reach past the left edge
    expect(left.y).toBe(6);
  });

  it('notch ends -> 6 points; concave reflex vertices set BACK into the rib by notchDepth', () => {
    const pts = ribPolygon(120, 12, { leftKind: 'notch', rightKind: 'notch' }, 6, 6.5);
    expect(pts.length).toBe(6);
    const rightReflex = pts.find((p) => p.x > 60 && p.x < 120);
    const leftReflex = pts.find((p) => p.x > 0 && p.x < 60);
    expect(rightReflex).toBeTruthy();
    expect(leftReflex).toBeTruthy();
    expect(120 - rightReflex.x).toBe(6.5); // set back by notchDepth from the right edge
    expect(rightReflex.y).toBe(6);
    expect(leftReflex.x).toBe(6.5);        // set back by notchDepth from the left edge
    expect(leftReflex.y).toBe(6);
    // exact simple-polygon vertex order (concave hexagon, no self-intersection)
    expect(pts).toEqual([
      { x: 0, y: 0 }, { x: 120, y: 0 }, { x: 113.5, y: 6 },
      { x: 120, y: 12 }, { x: 0, y: 12 }, { x: 6.5, y: 6 },
    ]);
  });

  it('mixed ends -> point on the right, notch on the left (both non-flat => 6 points)', () => {
    const pts = ribPolygon(120, 12, { leftKind: 'notch', rightKind: 'point' }, 6, 6.5);
    expect(pts.length).toBe(6);
    expect(pts.some((p) => p.x > 120)).toBe(true);                          // right point
    expect(pts.some((p) => p.x > 0 && p.x < 120 && p.y === 6)).toBe(true);  // left reflex
  });
});
