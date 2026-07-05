import { describe, it, expect } from 'vitest';
import {
  computeRibShapes,
  cornerPointReach,
  cornerNotchDepth,
  CORNER_CLEARANCE,
} from '../src/geometry/ribShapes.js';
import { DEFAULT_PARAMS } from '../src/params.js';

// Interlock rib geometry: per rib parity p=(wallIndex+ribIndex)%2.
//   p even -> WIDE:   convex POINT at BOTH corner ends (x>width and x<0).
//   p odd  -> NARROW: concave NOTCH at BOTH corner ends (reflex 0<x<width, set back by notchDepth).
// Adjacent walls differ by 1 in wallIndex -> opposite parity at the same ribIndex -> every
// corner is exactly one point + one notch. Numbers are PROVISIONAL / paper-fold-gated; these
// assert the CONSTRUCTION RULE, not ground-truth coordinates.

const shapeAt = (shapes, wallIndex, ribIndex) =>
  shapes.find((s) => s.wallIndex === wallIndex && s.ribIndex === ribIndex);
const isWide = (s) => s.points.some((p) => p.x > s.width || p.x < 0);   // convex apex past an edge
const isNarrow = (s) => s.points.some((p) => p.x > 0 && p.x < s.width); // concave reflex inside
const parity = (s) => (s.wallIndex + s.ribIndex) % 2;

describe('computeRibShapes cornerMode=interlock', () => {
  it('clear mode leaves every rib a 4-point rectangle (unchanged)', () => {
    const shapes = computeRibShapes({ ...DEFAULT_PARAMS, cornerMode: 'clear' });
    expect(shapes.length).toBeGreaterThan(0);
    for (const s of shapes) expect(s.points.length).toBe(4);
  });

  it('WIDE ribs (p even) carry a convex point at BOTH corner ends', () => {
    const shapes = computeRibShapes({ ...DEFAULT_PARAMS, cornerMode: 'interlock' });
    const wide = shapes.filter((s) => parity(s) === 0);
    expect(wide.length).toBeGreaterThan(0);
    for (const s of wide) {
      const depth = s.yBand.y1 - s.yBand.y0;
      const reach = cornerPointReach(depth, DEFAULT_PARAMS.cornerAllowance);
      const right = s.points.find((p) => p.x > s.width);
      const left = s.points.find((p) => p.x < 0);
      expect(right, 'wide rib right point').toBeTruthy();
      expect(left, 'wide rib left point').toBeTruthy();
      expect(right.x - s.width).toBeCloseTo(reach, 6); // reaches `reach` PAST the inset edge
      expect(right.y).toBeCloseTo(depth / 2, 6);       // apex on the y-midline
      expect(left.x).toBeCloseTo(-reach, 6);
      expect(left.y).toBeCloseTo(depth / 2, 6);
      expect(isNarrow(s)).toBe(false);                 // no reflex vertex
    }
  });

  it('NARROW ribs (p odd) carry a concave notch (setback) at BOTH corner ends', () => {
    const shapes = computeRibShapes({ ...DEFAULT_PARAMS, cornerMode: 'interlock' });
    const narrow = shapes.filter((s) => parity(s) === 1);
    expect(narrow.length).toBeGreaterThan(0);
    for (const s of narrow) {
      const depth = s.yBand.y1 - s.yBand.y0;
      const reach = cornerPointReach(depth, DEFAULT_PARAMS.cornerAllowance);
      const notchDepth = cornerNotchDepth(reach);
      const right = s.points.find((p) => p.x > s.width / 2 && p.x < s.width); // right reflex
      const left = s.points.find((p) => p.x > 0 && p.x < s.width / 2);        // left reflex
      expect(right, 'narrow rib right notch').toBeTruthy();
      expect(left, 'narrow rib left notch').toBeTruthy();
      expect(s.width - right.x).toBeCloseTo(notchDepth, 6); // set BACK by notchDepth
      expect(right.y).toBeCloseTo(depth / 2, 6);
      expect(left.x).toBeCloseTo(notchDepth, 6);
      expect(left.y).toBeCloseTo(depth / 2, 6);
      expect(isWide(s)).toBe(false);                        // no vertex past an edge
    }
  });

  it('a narrow rib is a SIMPLE concave hexagon in the exact specified vertex order', () => {
    const shapes = computeRibShapes({ ...DEFAULT_PARAMS, cornerMode: 'interlock' });
    const s = shapes.find((x) => parity(x) === 1);
    const depth = s.yBand.y1 - s.yBand.y0;
    const reach = cornerPointReach(depth, DEFAULT_PARAMS.cornerAllowance);
    const nd = cornerNotchDepth(reach);
    expect(s.points).toEqual([
      { x: 0, y: 0 },
      { x: s.width, y: 0 },
      { x: s.width - nd, y: depth / 2 }, // right notch reflex (inward)
      { x: s.width, y: depth },
      { x: 0, y: depth },
      { x: nd, y: depth / 2 },           // left notch reflex (inward)
    ]);
  });

  it('every interlock rib is FULL width (never half) with 6 vertices', () => {
    const shapes = computeRibShapes({ ...DEFAULT_PARAMS, cornerMode: 'interlock' });
    const wFold = DEFAULT_PARAMS.frontW - 2 * DEFAULT_PARAMS.cornerAllowance; // square default
    for (const s of shapes) {
      expect(s.points.length).toBe(6);
      expect(s.width).toBeCloseTo(wFold, 6);
    }
  });

  it('notchDepth = reach + clearance, clearance >= 0, nominal seating reach == notchDepth - clearance', () => {
    const reach = cornerPointReach(DEFAULT_PARAMS.rib, DEFAULT_PARAMS.cornerAllowance);
    expect(CORNER_CLEARANCE).toBeGreaterThanOrEqual(0);
    expect(cornerNotchDepth(reach)).toBeCloseTo(reach + CORNER_CLEARANCE, 6);
    expect(cornerNotchDepth(reach) - CORNER_CLEARANCE).toBeCloseTo(reach, 6);
  });

  it('parity drives wide/narrow: a single wall alternates wide/narrow down the draw', () => {
    const shapes = computeRibShapes({ ...DEFAULT_PARAMS, cornerMode: 'interlock' });
    const wall0 = shapes.filter((s) => s.wallIndex === 0).sort((a, b) => a.ribIndex - b.ribIndex);
    expect(wall0.length).toBeGreaterThan(1);
    for (let i = 1; i < wall0.length; i++) {
      expect(isWide(wall0[i])).toBe(!isWide(wall0[i - 1]));
    }
  });

  it('CORNER-PARITY INVARIANT: every corner is exactly one point + one notch (all 4 corners)', () => {
    // Load-bearing: corner c is shared by walls c and (c+1)%4 (WALL_FACES ring is W,H,W,H, an
    // even count). Their wallIndex differs by exactly 1 -> opposite parity at the same ribIndex.
    const shapes = computeRibShapes({ ...DEFAULT_PARAMS, cornerMode: 'interlock' });
    for (let c = 0; c < 4; c++) {
      for (const ribIndex of [0, 1, 2, 7, 12]) {
        const a = shapeAt(shapes, c, ribIndex);
        const b = shapeAt(shapes, (c + 1) % 4, ribIndex);
        expect(a && b, `corner ${c} rib ${ribIndex}`).toBeTruthy();
        expect(parity(a)).not.toBe(parity(b)); // opposite parity => one wide, one narrow
        expect((isWide(a) && isNarrow(b)) || (isNarrow(a) && isWide(b))).toBe(true);
      }
    }
  });
});
