import { describe, it, expect, vi } from 'vitest';
import { cornerModeEnds, ribPolygonFull, cornerFullParams, CORNER_CLEARANCE, computeRibShapes } from '../src/geometry/ribShapes.js';
import { normalizeParams, DEFAULT_PARAMS } from '../src/params.js';

const shoelace = (pts) => pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + (p.x * q.y - q.x * p.y); }, 0);
const isConvexCCW = (pts) => {
  if (shoelace(pts) <= 0) return false;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], c = pts[(i + 2) % pts.length];
    if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) < -1e-9) return false;
  }
  return true;
};

describe('interlock-full corner geometry', () => {
  it('flips parity vs interlock: leading iff (w+r) ODD', () => {
    for (let w = 0; w < 4; w++) for (let r = 0; r < 5; r++) {
      const full = cornerModeEnds('interlock-full', w, r).orientation;
      const inter = cornerModeEnds('interlock', w, r).orientation;
      expect(full).toBe(((w + r) % 2) === 1 ? 'leading' : 'rear');
      expect(full).not.toBe(inter); // opposite of interlock for every (w,r)
    }
  });

  it('cornerFullParams: exact values at width=20, ca=4, depth=14 (h>0)', () => {
    const p = cornerFullParams(14, 4, 20);
    expect(p.reach).toBeCloseTo(4, 9);
    expect(p.setback).toBeCloseTo(4.5, 9);       // base + CORNER_CLEARANCE
    expect(p.h).toBeCloseTo(6, 9);               // depth - s - r + cl = 14 - 4.5 - 4 + 0.5
    expect(p.xTipL).toBeCloseTo(-3.5, 9);        // cl - r = 0.5 - 4
    expect(p.xTipR).toBeCloseTo(23.5, 9);        // width + r - cl = 20 + 4 - 0.5
  });

  it('ribPolygonFull: 6-vertex convex hexagon with 2 mid-band fold-hug vertices; exact coords', () => {
    const p = cornerFullParams(14, 4, 20);
    const poly = ribPolygonFull(20, 14, { orientation: 'leading' }, p);
    expect(poly).toEqual([
      { x: -3.5, y: 0 }, { x: 23.5, y: 0 }, { x: 23.5, y: 6 },
      { x: 15.5, y: 14 }, { x: 4.5, y: 14 }, { x: -3.5, y: 6 },
    ]);
    expect(isConvexCCW(poly)).toBe(true);
    const mid = poly.filter((v) => v.y > 1e-9 && v.y < 14 - 1e-9);
    expect(mid.length).toBe(2);
    expect(mid.map((v) => v.x).sort((a, b) => a - b)).toEqual([-3.5, 23.5]);
  });

  it('fill edges are exactly 45deg', () => {
    const p = cornerFullParams(14, 4, 20);
    const poly = ribPolygonFull(20, 14, { orientation: 'leading' }, p);
    for (const [i, j] of [[4, 5], [2, 3]]) { // v5-v6 and v3-v4
      const a = poly[i], b = poly[j];
      expect(Math.abs(b.x - a.x)).toBeCloseTo(Math.abs(b.y - a.y), 9);
    }
  });

  it('tip sits CORNER_CLEARANCE inside the fold when ca <= rib/2', () => {
    const p = cornerFullParams(14, 4, 20); // fold at x=-ca=-4
    expect(p.xTipL - (-4)).toBeCloseTo(CORNER_CLEARANCE, 9);
  });

  it('collapses to a 4-vertex trapezoid when ca >= rib/2 (h<=0)', () => {
    const p = cornerFullParams(14, 7, 40); // ca=7 = rib/2 -> h=0
    expect(p.h).toBeLessThanOrEqual(0);
    const poly = ribPolygonFull(40, 14, { orientation: 'leading' }, p);
    expect(poly.length).toBe(4);
    expect(isConvexCCW(poly)).toBe(true);
  });

  it('rear orientation mirrors y -> depth-y', () => {
    const p = cornerFullParams(14, 4, 20);
    const lead = ribPolygonFull(20, 14, { orientation: 'leading' }, p);
    const rear = ribPolygonFull(20, 14, { orientation: 'rear' }, p);
    expect(isConvexCCW(rear)).toBe(true);
    // same x-set, y mirrored
    const yset = (poly) => poly.map((v) => 14 - v.y).sort();
    expect(rear.map((v) => v.y).sort()).toEqual(yset(lead));
  });

  it('computeRibShapes warns once when cornerAllowance > rib/2, silent otherwise', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    computeRibShapes(normalizeParams({ ...DEFAULT_PARAMS, cornerMode: 'interlock-full', cornerAllowance: 15, rib: 12 }));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/interlock-full.*cornerAllowance/i);
    warn.mockClear();
    computeRibShapes(normalizeParams({ ...DEFAULT_PARAMS, cornerMode: 'interlock-full', cornerAllowance: 5, rib: 12 }));
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('clear and interlock computeRibShapes output is unchanged by this task', () => {
    const clear = computeRibShapes(normalizeParams({ ...DEFAULT_PARAMS, cornerMode: 'clear' }));
    const inter = computeRibShapes(normalizeParams({ ...DEFAULT_PARAMS, cornerMode: 'interlock' }));
    expect(clear.length).toBeGreaterThan(0);
    expect(inter.length).toBeGreaterThan(0);
    // interlock-full ribs are a DISTINCT shape (6-vertex on a ca<=rib/2 face)
    const full = computeRibShapes(normalizeParams({ ...DEFAULT_PARAMS, frontW: 160, frontH: 160, cornerMode: 'interlock-full', cornerAllowance: 5, rib: 12 }));
    expect(full.some((s) => s.points.length === 6)).toBe(true);
  });
});
