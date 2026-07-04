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
