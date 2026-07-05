// tests/stl-interlock-earclip.test.js
// Interlock narrow ribs are CONCAVE (a triangular notch on each corner end). The STL top/
// bottom caps must be triangulated concavity-safe (ear-clipping), NOT a vertex-0 fan — a fan
// spans the notch void, filling it (non-manifold, and the setback a mating point seats into
// is lost). Rules asserted (numbers are paper-fold-gated so we test the CONSTRUCTION):
//   * V-2 triangles per polygon, all consistently CCW-wound;
//   * triangle areas sum EXACTLY to the polygon area (void not covered, no overlap);
//   * a point inside either notch void is covered by NO triangle;
//   * clear/wide ribs still triangulate exactly; bed-wrap/bridges unaffected.
import { describe, it, expect } from 'vitest';
import { exportRibsSTL, computeRibOutlines, earClip } from '../src/export/stl.js';
import { computeRibShapes } from '../src/geometry/ribShapes.js';
import { normalizeParams, DEFAULT_PARAMS } from '../src/params.js';

const base = {
  ...DEFAULT_PARAMS, type: 'straight', ribCount: 5,
  frontW: 150, frontH: 150, rearW: 150, rearH: 150,
  cornerAllowance: 15, rib: 12, gap: 2.5, ribThickness: 0.4,
  bedSize: 1000, printOffset: 0,
};
const model = { segments: [], regions: [], seamFaceIndex: 0, bounds: { w: 0, h: 0 }, metrics: { ribCount: 5 } };

const signedArea = (poly) => {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
};
const triArea = (a, b, c) => ((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2; // signed
const inTriangle = (p, a, b, c) => {
  const s = (u, v, w) => (v.x - u.x) * (w.y - u.y) - (w.x - u.x) * (v.y - u.y);
  const d1 = s(a, b, p);
  const d2 = s(b, c, p);
  const d3 = s(c, a, p);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
};

const shapesFor = (ov) => computeRibShapes(normalizeParams({ ...base, ...ov }));
const midOf = (s) => (s.yBand.y1 - s.yBand.y0) / 2;
const narrowRib = (shapes) =>
  shapes.find((s) => {
    const m = midOf(s);
    return s.points.some((p) => Math.abs(p.y - m) < 1e-6 && p.x > 0 && p.x < s.width);
  });
const wideRib = (shapes) => shapes.find((s) => s.points.some((p) => p.x < 0)); // outward apex

describe('earClip — concavity-safe cap triangulation', () => {
  it('(a) a notched (concave) rib -> V-2 CCW triangles, area-exact, both notch voids empty', () => {
    const s = narrowRib(shapesFor({ cornerMode: 'interlock' }));
    expect(s).toBeTruthy();
    const P = s.points;
    const tris = earClip(P);

    expect(tris.length).toBe(P.length - 2); // V-2 triangles

    const poly = signedArea(P);
    expect(poly).toBeGreaterThan(0); // canonical ring is CCW
    let sum = 0;
    for (const [a, b, c] of tris) {
      const ar = triArea(P[a], P[b], P[c]);
      expect(ar).toBeGreaterThan(1e-9); // consistent CCW orientation, no sliver/flip
      sum += ar;
    }
    expect(sum).toBeCloseTo(poly, 6); // AREA CONSERVATION: signed tri-areas sum to the ring
    // area. NOTE this alone is VACUOUS for concavity — a vertex-0 fan that SPANS the notch void
    // sums to the very same signed area (the void's over/under contributions cancel). The
    // per-triangle positivity above + the void-empty checks below are what actually pin the notch.

    const m = midOf(s);
    const left = P.find((p) => Math.abs(p.y - m) < 1e-6 && p.x < s.width / 2);
    const right = P.find((p) => Math.abs(p.y - m) < 1e-6 && p.x > s.width / 2);
    const leftVoid = { x: left.x / 2, y: m };               // strictly inside the left setback
    const rightVoid = { x: (right.x + s.width) / 2, y: m };  // strictly inside the right setback
    for (const [a, b, c] of tris) {
      expect(inTriangle(leftVoid, P[a], P[b], P[c])).toBe(false);
      expect(inTriangle(rightVoid, P[a], P[b], P[c])).toBe(false);
    }
  });

  it('(b) convex clear + wide ribs still triangulate exactly (V-2, area-conserving)', () => {
    const rect = shapesFor({ cornerMode: 'clear' })[0].points; // 4-vertex rectangle
    const rt = earClip(rect);
    expect(rt.length).toBe(rect.length - 2);
    let ar = 0;
    for (const [a, b, c] of rt) ar += Math.abs(triArea(rect[a], rect[b], rect[c]));
    expect(ar).toBeCloseTo(Math.abs(signedArea(rect)), 6);

    const wide = wideRib(shapesFor({ cornerMode: 'interlock' })); // pointed both ends (6 verts)
    const wt = earClip(wide.points);
    expect(wt.length).toBe(wide.points.length - 2);
    let aw = 0;
    for (const [a, b, c] of wt) aw += Math.abs(triArea(wide.points[a], wide.points[b], wide.points[c]));
    expect(aw).toBeCloseTo(Math.abs(signedArea(wide.points)), 6);
  });

  it('(c) exportRibsSTL caps are OUTWARD (top +z / bottom -z), top-cap area === polygon area, void empty; bridges intact', () => {
    const params = normalizeParams({ ...base, cornerMode: 'interlock' });
    const solids = computeRibOutlines(model, params);

    // the mesh really contains concave (narrow) ribs, else the assertion proves nothing
    const isConcave = (s) => {
      const yMin = Math.min(...s.points.map((p) => p.y));
      const yMax = Math.max(...s.points.map((p) => p.y));
      const m = (yMin + yMax) / 2;
      const xMin = Math.min(...s.points.map((p) => p.x));
      const xMax = Math.max(...s.points.map((p) => p.x));
      return s.points.some((p) => Math.abs(p.y - m) < 1e-6 && p.x > xMin && p.x < xMax);
    };
    expect(solids.some((s) => s.kind === 'rib' && isConcave(s))).toBe(true);
    // bed-wrap + breakaway bridges unaffected by the cap change
    expect(solids.some((s) => s.kind === 'bridge')).toBe(true);

    const buf = exportRibsSTL(model, params);
    const dv = new DataView(buf);
    const triCount = dv.getUint32(80, true);
    const expectedTri = solids.reduce((n, s) => n + 4 * s.points.length - 4, 0);
    expect(triCount).toBe(expectedTri); // header math still holds (n-2 per cap)
    expect(buf.byteLength).toBe(84 + triCount * 50);

    const z1 = params.ribThickness;
    const z0 = 0; // computeRibOutlines extrudes z0=0 .. z1=ribThickness
    // GEOMETRIC normal z-component from a triangle's own vertex winding: the z of (v1-v0)x(v2-v0).
    // The STL stores a ZEROED normal, so this is derived purely from winding. A manifold solid
    // needs OUTWARD caps: the TOP cap (the +z face) must wind so this is > 0, the BOTTOM cap (the
    // -z face) must wind so this is < 0. A flipped/inside-out cap (e.g. bottom emitted with the
    // top's winding) would ship green without this — the void/area checks don't see the sign.
    const normalZ = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    let capArea = 0;
    let topCaps = 0;
    let botCaps = 0;
    let o = 84;
    for (let t = 0; t < triCount; t++) {
      o += 12; // normal (zeroed)
      const v = [];
      for (let k = 0; k < 3; k++) {
        const x = dv.getFloat32(o, true); o += 4;
        const y = dv.getFloat32(o, true); o += 4;
        const z = dv.getFloat32(o, true); o += 4;
        v.push({ x, y, z });
      }
      o += 2; // attribute byte count
      const isTop = v.every((p) => Math.abs(p.z - z1) < 1e-4);
      const isBot = v.every((p) => Math.abs(p.z - z0) < 1e-4);
      if (isTop) {
        capArea += Math.abs(triArea(v[0], v[1], v[2]));
        expect(normalZ(v[0], v[1], v[2])).toBeGreaterThan(0); // TOP cap outward normal points +z
        topCaps++;
      } else if (isBot) {
        expect(normalZ(v[0], v[1], v[2])).toBeLessThan(0);    // BOTTOM cap outward normal points -z
        botCaps++;
      }
    }
    expect(topCaps).toBeGreaterThan(0); // caps really parsed, so the normal-sign asserts ran
    expect(botCaps).toBeGreaterThan(0);
    const polyArea = solids.reduce((sum, s) => sum + Math.abs(signedArea(s.points)), 0);
    // A vertex-0 fan OVER-covers each notch by depth*notchDepth (~78mm^2 x several narrow
    // ribs = hundreds of mm^2). Ear-clipping conserves area to float32 precision.
    expect(Math.abs(capArea - polyArea)).toBeLessThan(1);
  });
});
