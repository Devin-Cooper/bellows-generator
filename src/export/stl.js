// src/export/stl.js
import { normalizeParams } from '../params.js';
import { computeRibShapes } from '../geometry/ribShapes.js';
import { computeWallRibLayout } from '../geometry/wallRibLayout.js';

// Breakaway bridge width (mm): mirrors the laser lattice connector tab (<=2mm) so a
// printed column is one placeable object whose ribs snap apart after bonding. Added in
// the printability pass; the constant lives here for both passes.
const BRIDGE_WIDTH = 2;
// Plate margin (mm) between side-by-side family / bed-segment columns.
const PLATE_MARGIN = 10;
// How far (mm) each breakaway bridge penetrates INTO both neighbouring ribs so the three
// solids are truly fused (a positive overlap, never a zero-width kiss). Small vs rib depth.
const BRIDGE_OVERLAP = 0.1;

const xs = (pts) => pts.map((p) => p.x);
const ys = (pts) => pts.map((p) => p.y);
const widthOf = (pts) => Math.max(...xs(pts)) - Math.min(...xs(pts));
const yExtent = (pts) => ({ min: Math.min(...ys(pts)), max: Math.max(...ys(pts)) });
const xCenter = (pts) => (Math.min(...xs(pts)) + Math.max(...xs(pts))) / 2;

/**
 * INWARD print offset (elephant-foot / over-extrusion compensation): shrink the polygon
 * toward its bounding-box centre by `d` on each axis (OPPOSITE sign to the laser kerf,
 * which grows outward). Axis-aligned inset is exact for the clear rectangles emitted now;
 * PROVISIONAL for interlock point/notch ends (paper-fold + test-print gated, spec §7/§12).
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
 * X-centres of the breakaway tab(s) bridging one intra-segment gap, on the CLEAR width only
 * (the flat edges — NEVER the projecting interlock point). Normally TWO tabs, each inset by
 * `inset` (cornerAllowance) from a clear edge, so the snap scars clear the corner-fold zone.
 * A SMALL face (clearWidth < 2*(inset + BRIDGE_WIDTH/2)) can't fit two inset tabs and collapses
 * to a single centred tab. Tapered gaps pass the NARROWER of the two adjacent clear widths (both
 * ribs share `xCenter`) so each returned tab lands on BOTH ribs.
 * @param {number} clearWidth  min clear width of the two adjacent ribs
 * @param {number} xCenter     shared column centre both ribs are recentred on
 * @param {number} inset       cornerAllowance inset from each clear edge
 * @returns {number[]}  one (clamped) or two tab x-centres
 */
export function bridgeTabXs(clearWidth, xCenter, inset) {
  if (clearWidth < 2 * (inset + BRIDGE_WIDTH / 2)) return [xCenter];
  return [xCenter - clearWidth / 2 + inset, xCenter + clearWidth / 2 - inset];
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
  const bed = p.bedSize;
  const ca = p.cornerAllowance;
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
    let segStart = 0;
    let segIndex = 0;
    while (segStart < ribs.length) {
      // BED-WRAP: grow the segment until the next rib would overrun bedSize (always >=1 rib)
      let segLen = 0;
      let segEnd = segStart;
      while (segEnd < ribs.length) {
        const ext = yExtent(ribs[segEnd].points);
        const depth = ext.max - ext.min;
        const add = segEnd === segStart ? depth : p.gap + depth;
        if (segEnd > segStart && segLen + add > bed) break;
        segLen += add;
        segEnd++;
      }
      // place ribs [segStart, segEnd) as one bed-fitting breakaway piece
      let yCursor = 0;
      let maxW = 0;
      const spans = [];
      for (let k = segStart; k < segEnd; k++) {
        const s = ribs[k];
        const ext = yExtent(s.points);
        const depth = ext.max - ext.min;
        const cx = xCenter(s.points);
        const pts = insetPolygon(s.points, off).map((pt) => ({
          x: pt.x - cx + xCursor,      // recentre column at xCursor
          y: pt.y - ext.min + yCursor, // segment-local y starts at 0
        }));
        solids.push({ kind: 'rib', face, ribIndex: s.ribIndex, segmentIndex: segIndex, points: pts, z0, z1 });
        // record the placed rib's INSET y-extent (printOffset shrinks it inward) so bridges
        // attach to the real edges, not the pre-inset rib depth.
        const insetExt = yExtent(pts);
        // clear-width frame (the flat edges only, NOT the projecting point): both mating ribs are
        // recentred on xCursor, so the clear span is xCursor +- width/2. Recorded for tab placement.
        spans.push({ yMin: insetExt.min, yMax: insetExt.max, clearWidth: s.width, xCenter: xCursor });
        maxW = Math.max(maxW, widthOf(s.points));
        yCursor += depth + p.gap;
      }
      // CONNECTED breakaway bridges: TWO thin tabs across each intra-segment gap, INSET from the
      // clear-width ends (never across the bed boundary, so each segment stays one placeable,
      // snap-apart object). Each tab spans from just inside the lower rib's inset top edge to just
      // inside the upper rib's inset bottom edge (BRIDGE_OVERLAP each side) so it is fused to both,
      // even when printOffset>0 has pulled the inset ribs apart. Placing the tabs cornerAllowance
      // in from each flat edge keeps the break scar out of the corner-fold zone; a small face
      // collapses to a single centred tab (see bridgeTabXs).
      for (let k = 0; k < spans.length - 1; k++) {
        const y0 = spans[k].yMax - BRIDGE_OVERLAP;
        const y1 = spans[k + 1].yMin + BRIDGE_OVERLAP;
        // tapered: use the NARROWER of the two adjacent clear widths so each tab lands on both ribs.
        const clearWidth = Math.min(spans[k].clearWidth, spans[k + 1].clearWidth);
        for (const tx of bridgeTabXs(clearWidth, spans[k].xCenter, ca)) {
          solids.push({
            kind: 'bridge', face, ribIndex: ribs[segStart + k].ribIndex, segmentIndex: segIndex,
            points: [
              { x: tx - BRIDGE_WIDTH / 2, y: y0 },
              { x: tx + BRIDGE_WIDTH / 2, y: y0 },
              { x: tx + BRIDGE_WIDTH / 2, y: y1 },
              { x: tx - BRIDGE_WIDTH / 2, y: y1 },
            ],
            z0, z1,
          });
        }
      }
      xCursor += maxW + PLATE_MARGIN;
      segIndex++;
      segStart = segEnd;
    }
  }
  return solids;
}

/**
 * Ear-clipping triangulation of a SIMPLE polygon (convex OR concave). Returns triangles as
 * index triples into `points`, exactly points.length-2 of them, each wound CCW (positive
 * signed area in the xy-plane) regardless of the input winding. Unlike a vertex-0 fan this
 * never spans a reflex/notch void, so an interlock narrow rib's setback stays EMPTY (the
 * cap is manifold and a mating point can seat). Adequate for the small rib polygons here
 * (<= a few vertices); not a general-purpose robust triangulator.
 * @param {{x:number,y:number}[]} points
 * @returns {[number,number,number][]}
 */
export function earClip(points) {
  const n = points.length;
  if (n < 3) return [];
  const area2 = (a, b, c) =>
    (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y); // 2x signed area; > 0 === CCW
  const inTri = (p, a, b, c) => {
    const d1 = area2(a, b, p);
    const d2 = area2(b, c, p);
    const d3 = area2(c, a, p);
    const neg = d1 < 0 || d2 < 0 || d3 < 0;
    const pos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(neg && pos); // inside or on the boundary of the CCW triangle
  };
  // signed area of the whole ring; reverse the working index list to force a CCW traversal
  // so a convex ear is exactly a vertex with area2 > 0.
  let ring = 0;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const q = points[(i + 1) % n];
    ring += p.x * q.y - q.x * p.y;
  }
  const idx = [...Array(n).keys()];
  if (ring < 0) idx.reverse();

  const tris = [];
  let guard = n * n; // hard stop: never spin on malformed geometry
  while (idx.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i - 1 + idx.length) % idx.length];
      const ib = idx[i];
      const ic = idx[(i + 1) % idx.length];
      const a = points[ia];
      const b = points[ib];
      const c = points[ic];
      if (area2(a, b, c) <= 0) continue; // reflex/collinear vertex — not a convex ear
      let empty = true;
      for (let j = 0; j < idx.length; j++) {
        const iv = idx[j];
        if (iv === ia || iv === ib || iv === ic) continue;
        if (inTri(points[iv], a, b, c)) { empty = false; break; }
      }
      if (!empty) continue; // another vertex lies inside — not an ear
      tris.push([ia, ib, ic]);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break; // safety: bail rather than loop forever
  }
  if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
  return tris;
}

/**
 * Binary STL of a list of prism solids — shared by the bed-breakup (exportRibsSTL) and the
 * full/flat (exportFullRibsSTL) exports. Each solid extrudes its base polygon (V vertices)
 * z0..z1 -> (V-2) top + (V-2) bottom + 2V side triangles = 4V-4, so the header count is
 * SHAPE-AWARE (a clear rectangle -> 12; a trapezoid corner end adds triangles). Caps are ear-
 * clipped (convex OR concave-safe) and wound OUTWARD (+z top / -z bottom); the stored normal is
 * zeroed and slicers recompute it.
 * @param {{points:{x:number,y:number}[],z0:number,z1:number}[]} solids
 * @returns {ArrayBuffer}
 */
function writeBinarySTL(solids) {
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
    // Ear-clipped caps (n-2 per cap) keep the 4V-4 header math and stay manifold for any simple
    // polygon. earClip returns CCW triples: use them directly for the top (+z outward) and
    // reversed for the bottom (-z outward).
    const cap = earClip(P);
    for (const [a, b, c] of cap) tri(bot(a), bot(c), bot(b)); // bottom cap, -z outward
    for (const [a, b, c] of cap) tri(top(a), top(b), top(c)); // top cap,    +z outward
    for (let i = 0; i < n; i++) {                             // side walls
      const j = (i + 1) % n;
      tri(bot(i), bot(j), top(j));
      tri(bot(i), top(j), top(i));
    }
  }
  return buf;
}

/**
 * Binary STL of the BED-BREAKUP rib solids (columns bed-wrapped into snap-apart segments).
 * @param {import('../geometry/types.js').PatternModel} model
 * @param {Object} params
 * @returns {ArrayBuffer}
 */
export function exportRibsSTL(model, params) {
  const p = normalizeParams(params);
  return writeBinarySTL(computeRibOutlines(model, p));
}

/**
 * Rib solids for the FULL/FLAT print: all four WHOLE walls (W,H,W,H) laid out unrolled at their
 * fabric positions. computeWallRibLayout supplies the unrolled x (corner-fold gaps between
 * walls), the y = endMargin + ribIndex*pitch datum, the per-pleat clear width, and the corrected
 * rib-local trapezoids. There is NO bed-wrap (a 1:1 layout by design): every wall is one snap-
 * apart lattice bridged by two inset breakaway tabs per gap (Feature A / bridgeTabXs). Each rib
 * is shrunk INWARD by printOffset then translated to its (x,y). `model` is unused (rib data comes
 * from computeWallRibLayout) but kept for the caller signature parity with computeRibOutlines.
 * @param {import('../geometry/types.js').PatternModel} model
 * @param {Object} params
 * @returns {{kind:'rib'|'bridge',face:'W'|'H',wallIndex:number,ribIndex:number,points:{x:number,y:number}[],z0:number,z1:number}[]}
 */
export function computeFullRibOutlines(model, params) {
  const p = normalizeParams(params);
  const layout = computeWallRibLayout(p);
  const off = p.printOffset;
  const ca = p.cornerAllowance;
  const z0 = 0;
  const z1 = p.ribThickness;

  // group entries by wall, preserving W,H,W,H order and ribIndex order within a wall
  const byWall = new Map();
  for (const e of layout) {
    if (!byWall.has(e.wallIndex)) byWall.set(e.wallIndex, []);
    byWall.get(e.wallIndex).push(e);
  }

  const solids = [];
  for (const wallIndex of [...byWall.keys()].sort((a, b) => a - b)) {
    const entries = byWall.get(wallIndex).slice().sort((a, b) => a.ribIndex - b.ribIndex);
    const face = entries[0].face;
    const spans = [];
    for (const e of entries) {
      // shrink INWARD by printOffset (toward the rib's own centre), then translate to (x,y).
      const pts = insetPolygon(e.points, off).map((pt) => ({ x: pt.x + e.x, y: pt.y + e.y }));
      solids.push({ kind: 'rib', face, wallIndex, ribIndex: e.ribIndex, points: pts, z0, z1 });
      const ext = yExtent(pts);
      // clear-width x-edges are the whole rib's flat edges [x, x+width] (NOT the point reach).
      spans.push({ yMin: ext.min, yMax: ext.max, xClear0: e.x, xClear1: e.x + e.width });
    }
    // TWO inset tabs per gap — the wall is whole (no bed-wrap), so EVERY consecutive gap is bridged.
    for (let k = 0; k < spans.length - 1; k++) {
      const y0 = spans[k].yMax - BRIDGE_OVERLAP;
      const y1 = spans[k + 1].yMin + BRIDGE_OVERLAP;
      const cl = Math.max(spans[k].xClear0, spans[k + 1].xClear0); // shared clear-left overlap
      const cr = Math.min(spans[k].xClear1, spans[k + 1].xClear1); // narrower clear-right overlap
      for (const tx of bridgeTabXs(cr - cl, (cl + cr) / 2, ca)) {
        solids.push({
          kind: 'bridge', face, wallIndex, ribIndex: entries[k].ribIndex,
          points: [
            { x: tx - BRIDGE_WIDTH / 2, y: y0 },
            { x: tx + BRIDGE_WIDTH / 2, y: y0 },
            { x: tx + BRIDGE_WIDTH / 2, y: y1 },
            { x: tx - BRIDGE_WIDTH / 2, y: y1 },
          ],
          z0, z1,
        });
      }
    }
  }
  return solids;
}

/**
 * Binary STL of the FULL/FLAT whole-wall layout (computeFullRibOutlines).
 * @param {import('../geometry/types.js').PatternModel} model
 * @param {Object} params
 * @returns {ArrayBuffer}
 */
export function exportFullRibsSTL(model, params) {
  const p = normalizeParams(params);
  return writeBinarySTL(computeFullRibOutlines(model, p));
}
