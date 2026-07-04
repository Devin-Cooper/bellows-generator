import { describe, it, expect } from 'vitest';
import { cornerPointReach, ribPolygon } from '../src/geometry/ribShapes.js';

describe('cornerPointReach (PROVISIONAL 45deg bevel reach)', () => {
  it('is depth/2 (exact 45deg) when depth/2 <= cornerAllowance', () => {
    // default rib=12 -> depth/2=6 <= ca=15
    expect(cornerPointReach(12, 15)).toBe(6);
  });
  it('clamps to cornerAllowance so the apex never crosses the corner line (ABUT, not bond)', () => {
    // depth/2 = 20 > ca=15 -> clamp to 15 (bevel steeper than 45deg, flagged provisional)
    expect(cornerPointReach(40, 15)).toBe(15);
  });
});

describe('ribPolygon', () => {
  it('clear ends -> the 4-point inset rectangle (unchanged from Phase 1)', () => {
    const pts = ribPolygon(120, 12, { leftPointed: false, rightPointed: false }, 6);
    expect(pts).toEqual([
      { x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 12 }, { x: 0, y: 12 },
    ]);
  });
  it('both ends pointed -> 6 points; symmetric 45deg apexes reach past both inset edges (construction rule)', () => {
    // PROVISIONAL geometry: assert the CONSTRUCTION RULE, not the exact provisional apex coords.
    const pts = ribPolygon(120, 12, { leftPointed: true, rightPointed: true }, 6);
    expect(pts.length).toBe(6);
    const right = pts.find((p) => p.x > 120);
    const left = pts.find((p) => p.x < 0);
    expect(right).toBeTruthy();
    expect(left).toBeTruthy();
    expect(right.x).toBeGreaterThan(120);      // reaches toward the right corner
    expect(right.x - 120).toBe(12 / 2);        // 45deg: x-reach === depth/2
    expect(right.y).toBe(12 / 2);              // apex on the rib y-midline
    expect(left.x).toBeLessThan(0);            // reaches toward the left corner
  });
  it('only the right end pointed -> 5 points; left edge stays flat', () => {
    const pts = ribPolygon(120, 12, { leftPointed: false, rightPointed: true }, 6);
    expect(pts.length).toBe(5);
    expect(pts.some((p) => p.x < 0)).toBe(false);
    expect(pts.some((p) => p.x > 120)).toBe(true);
  });
});
