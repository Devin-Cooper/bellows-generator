// src/export/stl.js
import { normalizeParams } from '../params.js';
import { computeRibShapes } from '../geometry/ribShapes.js';

// Breakaway bridge width (mm): mirrors the laser lattice connector tab (<=2mm) so a
// printed column is one placeable object whose ribs snap apart after bonding. Added in
// the printability pass; the constant lives here for both passes.
const BRIDGE_WIDTH = 2;
// Plate margin (mm) between side-by-side family / bed-segment columns.
const PLATE_MARGIN = 10;

const xs = (pts) => pts.map((p) => p.x);
const ys = (pts) => pts.map((p) => p.y);
const widthOf = (pts) => Math.max(...xs(pts)) - Math.min(...xs(pts));
const yExtent = (pts) => ({ min: Math.min(...ys(pts)), max: Math.max(...ys(pts)) });
const xCenter = (pts) => (Math.min(...xs(pts)) + Math.max(...xs(pts))) / 2;

/**
 * INWARD print offset (elephant-foot / over-extrusion compensation): shrink the polygon
 * toward its bounding-box centre by `d` on each axis (OPPOSITE sign to the laser kerf,
 * which grows outward). Axis-aligned inset is exact for the clear rectangles emitted now;
 * PROVISIONAL for pointed/alternating bevels (paper-fold + test-print gated, spec §7/§12).
 * @param {{x:number,y:number}[]} pts @param {number} d
 * @returns {{x:number,y:number}[]}
 */
function insetPolygon(pts, d) {
  if (!d) return pts.map((p) => ({ x: p.x, y: p.y }));
  const cx = xCenter(pts);
  const ext = yExtent(pts);
  const cy = (ext.min + ext.max) / 2;
  const eps = 1e-9;
  return pts.map((p) => ({
    x: p.x + (Math.abs(p.x - cx) < eps ? 0 : (p.x < cx ? d : -d)),
    y: p.y + (Math.abs(p.y - cy) < eps ? 0 : (p.y < cy ? d : -d)),
  }));
}

/**
 * Rib solids for the 3D print, derived from the single canonical rib geometry
 * (computeRibShapes). Two W walls + two H walls collapse to one representative column
 * per face -> both W and H families are printed (P2). Each rib carries its INSET clear
 * polygon (faceWidth - 2*cornerAllowance, P1) shrunk INWARD by printOffset and stacked
 * at pitch on the bed. `model` is unused (rib count comes from params) but kept for the
 * caller signature. Bed-wrap + breakaway bridges are layered on in the printability task.
 * @param {import('../geometry/types.js').PatternModel} model
 * @param {Object} params
 * @returns {{kind:'rib'|'bridge',face:'W'|'H',ribIndex:number,segmentIndex:number,points:{x:number,y:number}[],z0:number,z1:number}[]}
 */
export function computeRibOutlines(model, params) {
  const p = normalizeParams(params);
  const shapes = computeRibShapes(p);
  const off = p.printOffset;
  const z0 = 0;
  const z1 = p.ribThickness;

  // one representative wall per face (the two W walls are identical, as are the two H)
  const firstWall = {};
  const byFace = { W: [], H: [] };
  for (const s of shapes) {
    if (firstWall[s.face] === undefined) firstWall[s.face] = s.wallIndex;
    if (s.wallIndex === firstWall[s.face]) byFace[s.face].push(s);
  }
  byFace.W.sort((a, b) => a.ribIndex - b.ribIndex);
  byFace.H.sort((a, b) => a.ribIndex - b.ribIndex);

  const solids = [];
  let xCursor = 0;
  for (const [face, ribs] of [['W', byFace.W], ['H', byFace.H]]) {
    if (!ribs.length) continue;
    let yCursor = 0;
    let maxW = 0;
    for (const s of ribs) {
      const ext = yExtent(s.points);
      const depth = ext.max - ext.min;
      const cx = xCenter(s.points);
      const pts = insetPolygon(s.points, off).map((pt) => ({
        x: pt.x - cx + xCursor,      // recentre column at xCursor
        y: pt.y - ext.min + yCursor, // stack at pitch, segment-local y starts at 0
      }));
      solids.push({ kind: 'rib', face, ribIndex: s.ribIndex, segmentIndex: 0, points: pts, z0, z1 });
      maxW = Math.max(maxW, widthOf(s.points));
      yCursor += depth + p.gap;
    }
    xCursor += maxW + PLATE_MARGIN;
  }
  return solids;
}

/**
 * Binary STL of the rib solids. Each solid is a prism: its base polygon (V vertices)
 * extruded z0..z1 -> (V-2) top + (V-2) bottom + 2V side triangles = 4V-4. The header
 * count is therefore SHAPE-AWARE (clear rectangles -> 12; pointed bevels add triangles),
 * replacing the old fixed 12*ribCount.
 * @param {import('../geometry/types.js').PatternModel} model
 * @param {Object} params
 * @returns {ArrayBuffer}
 */
export function exportRibsSTL(model, params) {
  const p = normalizeParams(params);
  const solids = computeRibOutlines(model, p);
  const triCount = solids.reduce((n, s) => n + 4 * s.points.length - 4, 0);
  const buf = new ArrayBuffer(84 + triCount * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, triCount, true);

  let off = 84;
  const tri = (a, b, c) => {
    off += 12; // zero normal; slicers recompute
    for (const v of [a, b, c]) {
      dv.setFloat32(off, v[0], true); off += 4;
      dv.setFloat32(off, v[1], true); off += 4;
      dv.setFloat32(off, v[2], true); off += 4;
    }
    off += 2; // attribute byte count
  };

  for (const s of solids) {
    const P = s.points;
    const n = P.length;
    const bot = (i) => [P[i].x, P[i].y, s.z0];
    const top = (i) => [P[i].x, P[i].y, s.z1];
    for (let i = 1; i < n - 1; i++) tri(bot(0), bot(i + 1), bot(i)); // bottom fan
    for (let i = 1; i < n - 1; i++) tri(top(0), top(i), top(i + 1)); // top fan
    for (let i = 0; i < n; i++) {                                    // side walls
      const j = (i + 1) % n;
      tri(bot(i), bot(j), top(j));
      tri(bot(i), top(j), top(i));
    }
  }
  return buf;
}
