// src/geometry/ribShapes.js
import { computeMetrics } from './metrics.js';
import { computeFaceFoldWidths } from './tapered.js';

// A rectangular ring has FOUR walls (two W, two H), traversed W, H, W, H.
// Fixes the P5 half-count ambiguity: ribs are emitted for all four walls.
const WALL_FACES = ['W', 'H', 'W', 'H'];

/**
 * Canonical per-(wall, rib) rib shapes — the SINGLE source of rib-shape truth.
 * One entry per (wall, ribIndex): four walls per ring (two 'W', two 'H').
 *
 * `points` is the CANONICAL rib-local polygon: origin at the rib band, +x across
 * the rib width (0..width), +y along the draw (0..rib). Consumers position it in
 * their own frame — fabric footprints in fabric space, ladder columns at the
 * shared datum, STL on the bed. ONE geometry, three placements.
 *
 * `width` = inset clear width = faceWidth - 2*cornerAllowance (cornerAllowance is
 * per-side). For TAPERED, faceWidth per pleat comes from computeFaceFoldWidths and
 * `ribIndex` maps to the pleat; for STRAIGHT (rear===front) every fold width equals
 * the constant face width.
 *
 * `yBand` is the along-draw band relative to the shared pleated-length datum
 * (rib 0 top = 0): y0 = ribIndex*pitch, y1 = y0 + rib. Consumers add their own
 * origin (endMargin for the fabric footprints and, from Phase 6, the ladder).
 *
 * `cornerShare` keys which ring corner each rib end abuts: corner c sits to the
 * RIGHT of wall c, so wall w meets corner w on its right and corner (w+3)%4 on its
 * left — every corner is shared by exactly two adjacent walls (label + paper-fold
 * key).
 *
 * PROVISIONAL / paper-fold-gated: this engine currently implements cornerMode
 * 'clear' only, so the corner-adjacent rib END is a square edge (rectangle). The
 * exact 45deg bevel for 'pointed'/'alternating' (Harlin: adjacent walls' end-angles
 * sum to 90deg on a square) is empirically gated on a printed paper fold and is
 * added in Phase 5 — it is intentionally NOT encoded here.
 *
 * @param {Object} params  Normalized or raw params (computeFaceFoldWidths normalizes).
 * @returns {import('./types.js').RibShape[]}
 */
export function computeRibShapes(params) {
  const { ribCount, pitch } = computeMetrics(params);
  const rib = params.rib;
  const ca = params.cornerAllowance;
  const { width: wFold, height: hFold } = computeFaceFoldWidths(params);

  const shapes = [];
  for (let wallIndex = 0; wallIndex < WALL_FACES.length; wallIndex++) {
    const face = WALL_FACES[wallIndex];
    const foldWidths = face === 'W' ? wFold : hFold;
    const rightCorner = wallIndex;
    const leftCorner = (wallIndex + 3) % 4;
    for (let ribIndex = 0; ribIndex < ribCount; ribIndex++) {
      const faceWidth = foldWidths[ribIndex];       // per-pleat for tapered, constant for straight
      const width = faceWidth - 2 * ca;             // inset clear width (fixes P1/P3)
      const y0 = ribIndex * pitch;
      const y1 = y0 + rib;
      // cornerMode 'clear': the inset rectangle in rib-local coords.
      // PROVISIONAL corner-end geometry (square) — pointed/alternating land in Phase 5.
      const points = [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: rib },
        { x: 0, y: rib },
      ];
      shapes.push({
        face,
        wallIndex,
        ribIndex,
        cornerShare: { leftCorner, rightCorner },
        width,
        yBand: { y0, y1 },
        points,
      });
    }
  }
  return shapes;
}

/**
 * PROVISIONAL corner-point geometry — paper-fold-gated (see Phase-5 plan note).
 * Symmetric 45deg triangular apex reach for a pointed rib end. The apex sits on the
 * rib's y-midline and extends past the inset edge toward the corner by `reach`:
 *   reach = min(cornerAllowance, depth/2)
 * so the two bevel edges are exactly 45deg to the draw for the default rib (depth/2 <= ca)
 * and clamp to the corner zone otherwise. Clamping keeps the apex INSIDE the wall's own
 * cornerAllowance band: adjacent walls' points ABUT along the corner diagonal, never bond
 * across it. Exact reach + taper-dependent angle are validated by a printed paper fold.
 * @param {number} depth  rib depth along the draw (yBand.y1 - yBand.y0)
 * @param {number} cornerAllowance  per-side corner clear-zone width
 * @returns {number}
 */
export function cornerPointReach(depth, cornerAllowance) {
  return Math.min(cornerAllowance, depth / 2);
}

/**
 * Canonical rib-local polygon. Rectangle for clear ends; a symmetric 45deg apex is
 * inserted past x=width (right end) and/or x=0 (left end) toward the corner. Vertex
 * order stays a simple CCW-traced closed polygon so every consumer (footprint, ladder
 * cut outline, STL extrusion) can trace/triangulate it directly.
 * @param {number} width  inset clear width (faceWidth - 2*cornerAllowance, per pleat)
 * @param {number} depth  rib depth along the draw
 * @param {{leftPointed:boolean,rightPointed:boolean}} ends
 * @param {number} reach  apex reach from cornerPointReach()
 * @returns {{x:number,y:number}[]}
 */
export function ribPolygon(width, depth, ends, reach) {
  const pts = [{ x: 0, y: 0 }, { x: width, y: 0 }];
  if (ends.rightPointed) pts.push({ x: width + reach, y: depth / 2 });
  pts.push({ x: width, y: depth }, { x: 0, y: depth });
  if (ends.leftPointed) pts.push({ x: -reach, y: depth / 2 });
  return pts;
}
