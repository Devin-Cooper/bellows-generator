import { describe, it, expect } from 'vitest';
import {
  cornerReachSetback,
  CORNER_CLEARANCE,
  ribPolygon,
} from '../src/geometry/ribShapes.js';

describe('cornerReachSetback (PROVISIONAL half-point projection)', () => {
  it('square (no taper): reach == setback == min(cornerAllowance, depth/2) — a 45deg diagonal', () => {
    expect(cornerReachSetback(12, 15)).toEqual({ reach: 6, setback: 6 });
  });
  it('clamps the base to cornerAllowance so the point never overruns the corner-fold gap', () => {
    expect(cornerReachSetback(40, 15)).toEqual({ reach: 15, setback: 15 });
  });
  it('tapered: the Wide end reaches base+taper, the Narrow end sets back to base-taper', () => {
    const { reach, setback } = cornerReachSetback(12, 15, 2);
    expect(reach).toBeCloseTo(8, 6);
    expect(setback).toBeCloseTo(4, 6);
    // the two end-angles sum to 90deg on a square, so reach+setback == 2*base always
    expect(reach + setback).toBeCloseTo(12, 6);
    expect(reach - setback).toBeCloseTo(2 * 2, 6);
  });
});

describe('CORNER_CLEARANCE (reserved provisional tip gap)', () => {
  it('is exported, small and non-negative (derived, not a UI param)', () => {
    expect(CORNER_CLEARANCE).toBeGreaterThanOrEqual(0);
    expect(CORNER_CLEARANCE).toBeLessThanOrEqual(2);
  });
});

describe('ribPolygon — convex trapezoid / rectangle', () => {
  it('clear (orientation null) -> the 4-point inset rectangle', () => {
    const pts = ribPolygon(120, 12, { orientation: null }, 6, 6);
    expect(pts).toEqual([
      { x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 12 }, { x: 0, y: 12 },
    ]);
  });

  it('leading -> long/pointing edge on y=0, short cut-off edge on y=depth (exact vertex order)', () => {
    const pts = ribPolygon(120, 12, { orientation: 'leading' }, 6, 5);
    expect(pts).toEqual([
      { x: -6, y: 0 },        // point projects `reach` past the LEFT edge, on the y=0 band edge
      { x: 126, y: 0 },       // point projects `reach` past the RIGHT edge, on the y=0 band edge
      { x: 115, y: 12 },      // short edge inset `setback` from the right, on the y=depth band edge
      { x: 5, y: 12 },        // short edge inset `setback` from the left, on the y=depth band edge
    ]);
    expect(pts.length).toBe(4);
    // apex on a BAND EDGE (y in {0,depth}), never mid-depth
    expect(pts.some((p) => p.y === 6)).toBe(false);
  });

  it('rear -> long/pointing edge on y=depth, short cut-off edge on y=0 (exact vertex order)', () => {
    const pts = ribPolygon(120, 12, { orientation: 'rear' }, 6, 5);
    expect(pts).toEqual([
      { x: 5, y: 0 },
      { x: 115, y: 0 },
      { x: 126, y: 12 },
      { x: -6, y: 12 },
    ]);
    expect(pts.some((p) => p.y === 6)).toBe(false);
  });

  it('both orientations are convex, CCW (positive area), 4-vertex — one diagonal per end, no reflex', () => {
    const signedArea = (P) => {
      let a = 0;
      for (let i = 0; i < P.length; i++) { const p = P[i]; const q = P[(i + 1) % P.length]; a += p.x * q.y - q.x * p.y; }
      return a / 2;
    };
    const isConvex = (P) => {
      let sign = 0;
      for (let i = 0; i < P.length; i++) {
        const a = P[i]; const b = P[(i + 1) % P.length]; const c = P[(i + 2) % P.length];
        const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
        if (Math.abs(cr) < 1e-12) continue;
        const s = Math.sign(cr);
        if (sign === 0) sign = s; else if (s !== sign) return false;
      }
      return true;
    };
    for (const orientation of ['leading', 'rear']) {
      const P = ribPolygon(120, 12, { orientation }, 6, 5);
      expect(P.length).toBe(4);
      expect(signedArea(P)).toBeGreaterThan(0);
      expect(isConvex(P)).toBe(true);
    }
  });
});
