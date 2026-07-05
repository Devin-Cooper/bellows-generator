import { describe, it, expect } from 'vitest';
import {
  computeRibShapes,
  cornerReachSetback,
  CORNER_CLEARANCE,
} from '../src/geometry/ribShapes.js';
import { DEFAULT_PARAMS } from '../src/params.js';

// Interlock rib geometry (CORRECTED): each rib is a CONVEX isosceles TRAPEZOID carrying HALF a
// corner point, its apex on a band edge (fold line y=0 or y=depth), never mid-depth. Per rib
// parity p=(wallIndex+ribIndex)%2 the orientation flips: even -> 'leading' (long edge on y=0),
// odd -> 'rear' (long edge on y=depth). Adjacent walls differ by 1 in wallIndex -> opposite
// parity -> opposite orientation, so their half-diagonals meet on the shared fold line and form
// one full point. Numbers are PROVISIONAL / paper-fold-gated; these assert the CONSTRUCTION RULE.

const shapeAt = (shapes, wallIndex, ribIndex) =>
  shapes.find((s) => s.wallIndex === wallIndex && s.ribIndex === ribIndex);
const parity = (s) => (s.wallIndex + s.ribIndex) % 2;
const depthOf = (s) => s.yBand.y1 - s.yBand.y0;
// A trapezoid projects its point past a clear edge (x<0 or x>width) at ONE band edge.
const isTrapezoid = (s) => s.points.some((p) => p.x < -1e-9 || p.x > s.width + 1e-9);
// Orientation read from the polygon: 'leading' if the point projects on the y=0 band edge.
const orientationOf = (s) => {
  const y0min = Math.min(...s.points.filter((p) => Math.abs(p.y) < 1e-6).map((p) => p.x));
  return y0min < -1e-6 ? 'leading' : 'rear';
};
// reach/setback read generically from the four distinct x-values {-reach, setback, width-setback,
// width+reach} sorted ascending.
const reachSetbackOf = (s) => {
  const xs = [...new Set(s.points.map((p) => p.x))].sort((a, b) => a - b);
  return { reach: -xs[0], setback: xs[1] };
};
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

describe('computeRibShapes cornerMode=interlock — trapezoid half-points', () => {
  it('clear mode leaves every rib a 4-point rectangle (unchanged)', () => {
    const shapes = computeRibShapes({ ...DEFAULT_PARAMS, cornerMode: 'clear' });
    expect(shapes.length).toBeGreaterThan(0);
    for (const s of shapes) expect(s.points.length).toBe(4);
  });

  it('every interlock rib is a CONVEX 4-vertex trapezoid — NO reflex/concave vertex, apex on a band edge', () => {
    const shapes = computeRibShapes({ ...DEFAULT_PARAMS, cornerMode: 'interlock' });
    for (const s of shapes) {
      expect(s.points.length).toBe(4);
      expect(isConvex(s.points)).toBe(true);            // convex trapezoid, no notch
      expect(signedArea(s.points)).toBeGreaterThan(0);  // canonical CCW ring
      expect(isTrapezoid(s)).toBe(true);                // projects a point past a clear edge
      const m = depthOf(s) / 2;
      expect(s.points.some((p) => Math.abs(p.y - m) < 1e-6)).toBe(false); // NEVER a mid-depth vertex
      for (const p of s.points) {
        expect(Math.abs(p.y) < 1e-6 || Math.abs(p.y - depthOf(s)) < 1e-6).toBe(true); // apex on band edge
      }
    }
  });

  it('orientation is keyed by parity: p even -> leading (long edge y=0), p odd -> rear (long edge y=depth)', () => {
    const shapes = computeRibShapes({ ...DEFAULT_PARAMS, cornerMode: 'interlock' });
    for (const s of shapes) {
      expect(orientationOf(s)).toBe(parity(s) === 0 ? 'leading' : 'rear');
    }
  });

  it('BOTH corner ends of a rib share the SAME orientation (one trapezoid, not per-end)', () => {
    const shapes = computeRibShapes({ ...DEFAULT_PARAMS, cornerMode: 'interlock' });
    for (const s of shapes) {
      const depth = depthOf(s);
      // the point projects past BOTH the left (x<0) and right (x>width) edges on the SAME band edge
      const leftApex = s.points.find((p) => p.x < -1e-9);
      const rightApex = s.points.find((p) => p.x > s.width + 1e-9);
      expect(leftApex).toBeTruthy();
      expect(rightApex).toBeTruthy();
      expect(leftApex.y).toBeCloseTo(rightApex.y, 6);                       // same band edge
      expect(leftApex.y === 0 || Math.abs(leftApex.y - depth) < 1e-6).toBe(true);
    }
  });

  it('square default: reach == setback (45deg), reach fits inside cornerAllowance', () => {
    const shapes = computeRibShapes({ ...DEFAULT_PARAMS, cornerMode: 'interlock' });
    for (const s of shapes) {
      const { reach, setback } = reachSetbackOf(s);
      expect(reach).toBeCloseTo(setback, 6);                        // square => equal (45deg)
      expect(reach).toBeLessThanOrEqual(DEFAULT_PARAMS.cornerAllowance + 1e-9);
      const base = cornerReachSetback(depthOf(s), DEFAULT_PARAMS.cornerAllowance).reach;
      expect(reach).toBeCloseTo(base, 6);
    }
    expect(CORNER_CLEARANCE).toBeGreaterThanOrEqual(0);
  });

  it('every interlock rib is FULL clear width (never a half) = faceWidth - 2*cornerAllowance', () => {
    const shapes = computeRibShapes({ ...DEFAULT_PARAMS, cornerMode: 'interlock' });
    const wFold = DEFAULT_PARAMS.frontW - 2 * DEFAULT_PARAMS.cornerAllowance; // square default
    for (const s of shapes) expect(s.width).toBeCloseTo(wFold, 6);
  });

  it('shared datum UNCHANGED: yBand.y0 = ribIndex * pitch (no half-pitch stagger)', () => {
    const shapes = computeRibShapes({ ...DEFAULT_PARAMS, cornerMode: 'interlock' });
    const pit = DEFAULT_PARAMS.rib + DEFAULT_PARAMS.gap;
    for (const s of shapes) expect(s.yBand.y0).toBeCloseTo(s.ribIndex * pit, 6);
  });

  it('consecutive ribs on a wall carry COMPLEMENTARY orientation (halves meet at the fold line)', () => {
    const shapes = computeRibShapes({ ...DEFAULT_PARAMS, cornerMode: 'interlock' });
    const wall0 = shapes.filter((s) => s.wallIndex === 0).sort((a, b) => a.ribIndex - b.ribIndex);
    expect(wall0.length).toBeGreaterThan(1);
    for (let i = 1; i < wall0.length; i++) {
      expect(orientationOf(wall0[i])).not.toBe(orientationOf(wall0[i - 1]));
    }
  });

  it('ANTIPHASE PARITY: every corner pairs a leading half with a rear half (all 4 corners)', () => {
    // corner c is shared by walls c and (c+1)%4; their wallIndex differs by 1 -> opposite parity
    // at the same ribIndex -> opposite orientation -> one full point per corner.
    const shapes = computeRibShapes({ ...DEFAULT_PARAMS, cornerMode: 'interlock' });
    for (let c = 0; c < 4; c++) {
      for (const ribIndex of [0, 1, 2, 7, 12]) {
        const a = shapeAt(shapes, c, ribIndex);
        const b = shapeAt(shapes, (c + 1) % 4, ribIndex);
        expect(a && b, `corner ${c} rib ${ribIndex}`).toBeTruthy();
        expect(parity(a)).not.toBe(parity(b));
        expect(orientationOf(a)).not.toBe(orientationOf(b)); // leading + rear = one shared point
      }
    }
  });
});

describe('computeRibShapes interlock — tapered asymmetry + small-face guard', () => {
  const TAPER = {
    ...DEFAULT_PARAMS, type: 'tapered',
    rearW: 200, frontW: 100, rearH: 150, frontH: 80, ribCount: 5,
  };
  // frontW=frontH=40, ca=15 -> inset width=10; a square tiny face.
  const TINY = { ...DEFAULT_PARAMS, frontW: 40, frontH: 40, rearW: 40, rearH: 40, ribCount: 3 };

  it('tapered: reach != setback for some ribs (Wide/Narrow split), still convex trapezoids', () => {
    const shapes = computeRibShapes({ ...TAPER, cornerMode: 'interlock' });
    let asymmetric = 0;
    for (const s of shapes) {
      expect(s.points.length).toBe(4);
      expect(isConvex(s.points)).toBe(true);
      expect(signedArea(s.points)).toBeGreaterThan(0);
      const { reach, setback } = reachSetbackOf(s);
      if (Math.abs(reach - setback) > 1e-6) asymmetric++;
    }
    expect(asymmetric).toBeGreaterThan(0); // taper feeds a genuine Wide/Narrow asymmetry
  });

  it('small-face guard: width >= 2*setback so the short cut-off edge stays non-negative (no bowtie)', () => {
    for (const ov of [TINY, TAPER]) {
      const shapes = computeRibShapes({ ...ov, cornerMode: 'interlock' });
      for (const s of shapes) {
        const { setback } = reachSetbackOf(s);
        expect(s.width).toBeGreaterThanOrEqual(2 * setback - 1e-9);
        expect(isConvex(s.points)).toBe(true);       // still simple/convex on a tiny face
        expect(signedArea(s.points)).toBeGreaterThan(0);
      }
    }
  });

  it('tiny-face NON-degeneracy: short-edge vertices stay DISTINCT (setback < width/2 strictly, no duplicate vertex)', () => {
    // TINY: frontW=frontH=40, ca=15 -> width=10; depth=rib=12 -> natural setback=min(ca,depth/2)=6.
    // Clamping setback to EXACTLY width/2 (=5) collapses {setback,y} and {width-setback,y} into ONE
    // point -> a duplicate-vertex trapezoid whose STL cap triangle is zero-area. A strict cap keeps
    // the two short-edge vertices distinct so caps stay non-degenerate.
    const shapes = computeRibShapes({ ...TINY, cornerMode: 'interlock' });
    expect(shapes.length).toBeGreaterThan(0);
    // Every TINY interlock rib clamps (width/2=5 < natural setback=6), so this catches the degeneracy.
    let clamped = 0;
    for (const s of shapes) {
      const { setback } = reachSetbackOf(s);
      // The two SHORT-EDGE (setback) vertices are the two that sit inside [0,width]; the wide-base
      // apexes project OUT to x<0 and x>width. They must be strictly distinct.
      const inner = s.points.filter((p) => p.x > -1e-9 && p.x < s.width + 1e-9);
      expect(inner.length).toBe(2);                                  // exactly the two short-edge verts
      const [lo, hi] = inner.map((p) => p.x).sort((a, b) => a - b);
      expect(hi - lo).toBeGreaterThan(0);                            // short-edge vertices DISTINCT
      // width - setback > setback strictly (setback strictly under width/2)
      expect(s.width - setback).toBeGreaterThan(setback);
      expect(setback).toBeLessThan(s.width / 2);
      // The 4 polygon vertices are all distinct (no coincident duplicate -> non-degenerate STL cap).
      const uniq = new Set(s.points.map((p) => `${Math.round(p.x * 1e6)},${Math.round(p.y * 1e6)}`));
      expect(uniq.size).toBe(4);
      if (setback < 6 - 1e-9) clamped++;                             // clamp actually engaged
    }
    expect(clamped).toBe(shapes.length); // every tiny-face rib was in the clamp regime
  });
});
