// tests/stl-interlock-earclip.test.js
// CORRECTED interlock ribs are CONVEX isosceles TRAPEZOIDS (4 vertices, no concave notch). The
// STL top/bottom caps triangulate to V-2 = 2 triangles per rib (12-tri prism, same as a clear
// rectangle), area-conserving and outward-wound. earClip stays (belt-and-suspenders — correct for
// convex too). Numbers are paper-fold-gated so we test the CONSTRUCTION, not coordinates.
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

const shapesFor = (ov) => computeRibShapes(normalizeParams({ ...base, ...ov }));
// a trapezoid rib projects its point past a clear edge (x<0 or x>width).
const trapezoidRib = (shapes) => shapes.find((s) => s.points.some((p) => p.x < 0 || p.x > s.width));

describe('earClip — convex trapezoid cap triangulation', () => {
  it('(a) every interlock rib is a convex 4-vertex trapezoid (no reflex/notch vertex on the y-midline)', () => {
    const shapes = shapesFor({ cornerMode: 'interlock' });
    const traps = shapes.filter((s) => s.points.some((p) => p.x < 0 || p.x > s.width));
    expect(traps.length).toBeGreaterThan(0);
    for (const s of traps) {
      expect(s.points.length).toBe(4);
      expect(isConvex(s.points)).toBe(true);
      const m = (s.yBand.y1 - s.yBand.y0) / 2;
      expect(s.points.some((p) => Math.abs(p.y - m) < 1e-6)).toBe(false); // no mid-depth vertex
    }
  });

  it('(b) a trapezoid caps to V-2 = 2 CCW triangles, area-conserving', () => {
    const s = trapezoidRib(shapesFor({ cornerMode: 'interlock' }));
    expect(s).toBeTruthy();
    const P = s.points;
    const tris = earClip(P);
    expect(tris.length).toBe(P.length - 2); // 2
    const poly = signedArea(P);
    expect(poly).toBeGreaterThan(0);
    let sum = 0;
    for (const [a, b, c] of tris) {
      const ar = triArea(P[a], P[b], P[c]);
      expect(ar).toBeGreaterThan(1e-9); // consistent CCW, no sliver/flip
      sum += ar;
    }
    expect(sum).toBeCloseTo(poly, 6); // caps cover exactly the polygon
  });

  it('(b2) clear rectangles still cap exactly (V-2, area-conserving)', () => {
    const rect = shapesFor({ cornerMode: 'clear' })[0].points; // 4-vertex rectangle
    const rt = earClip(rect);
    expect(rt.length).toBe(rect.length - 2);
    let ar = 0;
    for (const [a, b, c] of rt) ar += Math.abs(triArea(rect[a], rect[b], rect[c]));
    expect(ar).toBeCloseTo(Math.abs(signedArea(rect)), 6);
  });

  it('(c) exportRibsSTL: 4V-4 header math (12 tri per 4-vertex rib), caps OUTWARD, area === polygon; bridges intact', () => {
    const params = normalizeParams({ ...base, cornerMode: 'interlock' });
    const solids = computeRibOutlines(model, params);

    // the mesh really contains trapezoid (interlock) ribs, else the assertion proves nothing:
    // a trapezoid has 4 DISTINCT x-values ({-reach, setback, width-setback, width+reach}),
    // a clear rectangle only 2.
    const distinctXs = (s) => new Set(s.points.map((p) => Math.round(p.x * 1e4) / 1e4)).size;
    expect(solids.some((s) => s.kind === 'rib' && distinctXs(s) > 2)).toBe(true);
    expect(solids.some((s) => s.kind === 'bridge')).toBe(true); // breakaway bridges unaffected

    const buf = exportRibsSTL(model, params);
    const dv = new DataView(buf);
    const triCount = dv.getUint32(80, true);
    const expectedTri = solids.reduce((n, s) => n + 4 * s.points.length - 4, 0);
    expect(triCount).toBe(expectedTri);         // header math still holds (n-2 per cap)
    expect(buf.byteLength).toBe(84 + triCount * 50);
    // every rib is now 4-vertex -> exactly 12 triangles per rib solid (back down from 6V/20-tri)
    for (const s of solids.filter((o) => o.kind === 'rib')) expect(s.points.length).toBe(4);

    const z1 = params.ribThickness;
    const z0 = 0;
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
    expect(topCaps).toBeGreaterThan(0);
    expect(botCaps).toBeGreaterThan(0);
    const polyArea = solids.reduce((sum, s) => sum + Math.abs(signedArea(s.points)), 0);
    expect(Math.abs(capArea - polyArea)).toBeLessThan(1); // caps cover exactly the base polygons
  });
});
