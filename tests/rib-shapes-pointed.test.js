import { describe, it, expect } from 'vitest';
import { computeRibShapes } from '../src/geometry/ribShapes.js';
import { DEFAULT_PARAMS } from '../src/params.js';

describe('computeRibShapes cornerMode=pointed', () => {
  it('clear mode leaves every rib a 4-point rectangle (Phase 1 unchanged)', () => {
    const shapes = computeRibShapes({ ...DEFAULT_PARAMS, cornerMode: 'clear' });
    expect(shapes.length).toBeGreaterThan(0);
    for (const s of shapes) expect(s.points.length).toBe(4);
  });

  it('pointed mode puts a 45deg point at BOTH corner ends of every rib (6 points)', () => {
    const shapes = computeRibShapes({ ...DEFAULT_PARAMS, cornerMode: 'pointed' });
    for (const s of shapes) {
      expect(s.points.length).toBe(6);
      const depth = s.yBand.y1 - s.yBand.y0;
      const right = s.points.find((p) => p.x > s.width);  // reaches toward right corner
      const left = s.points.find((p) => p.x < 0);         // reaches toward left corner
      expect(right).toBeTruthy();
      expect(left).toBeTruthy();
      expect(right.x - s.width).toBeCloseTo(depth / 2);   // 45deg construction rule
      expect(right.y).toBeCloseTo(depth / 2);
      expect(left.x).toBeCloseTo(-(depth / 2), 6);        // symmetric: -reach = -(depth/2)
      expect(left.y).toBeCloseTo(depth / 2, 6);           // apex on the rib y-midline
    }
  });

  it('adjacent walls sharing a corner BOTH carry a point (all four walls at a pleat point)', () => {
    const shapes = computeRibShapes({ ...DEFAULT_PARAMS, cornerMode: 'pointed' });
    const rib0 = shapes.filter((s) => s.ribIndex === 0);
    expect(rib0.length).toBe(4);                           // four walls per ring
    for (const s of rib0) expect(s.points.length).toBe(6);
  });
});
