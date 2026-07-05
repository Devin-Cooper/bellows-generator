// src/geometry/ribShapes.js
// Interlock corner geometry (cornerMode 'interlock'): per rib parity p=(wallIndex+ribIndex)%2,
// WIDE ribs (p even) grow a convex point at BOTH corner ends and NARROW ribs (p odd) cut a
// concave notch (setback) at BOTH corner ends. Adjacent walls (wallIndex differs by 1) are
// opposite parity at the same ribIndex, so every corner is exactly one point + one notch — the
// peak-meets-valley interlock. The exact reach / notchDepth / clearance / taper end-angle are
// PROVISIONAL and paper-fold-gated (same status as the fabric miters and tapered widths); tests
// assert the CONSTRUCTION RULE only, not ground-truth coordinates.
// See docs .../plans/2026-07-04-stiffener-interlock-design.md.
import { computeMetrics } from './metrics.js';
import { computeFaceFoldWidths } from './tapered.js';

// A rectangular ring has FOUR walls (two W, two H), traversed W, H, W, H.
const WALL_FACES = ['W', 'H', 'W', 'H'];

// PROVISIONAL clearance gap (mm) between a seated point and the bottom of the mating notch —
// paper-fold-gated. The notch is cut this much DEEPER than the point reaches, so a nested point
// never bottoms out / pierces the cloth (Mitchell). Small, non-negative, derived — NOT a UI param.
export const CORNER_CLEARANCE = 0.5;

/**
 * Canonical per-(wall, rib) rib shapes — the SINGLE source of rib-shape truth.
 * One entry per (wall, ribIndex): four walls per ring (two 'W', two 'H').
 *
 * `points` is the CANONICAL rib-local polygon: origin at the rib band, +x across the rib width
 * (0..width), +y along the draw (0..rib). Consumers position it in their own frame — fabric
 * footprints in fabric space, ladder columns at the shared datum, STL on the bed.
 *
 * `width` = inset clear width = faceWidth - 2*cornerAllowance. For TAPERED, faceWidth per pleat
 * comes from computeFaceFoldWidths and `ribIndex` maps to the pleat; for STRAIGHT every fold
 * width equals the constant face width.
 *
 * `yBand` is the along-draw band relative to the shared pleated-length datum: y0 = ribIndex*pitch
 * (SHARED across all walls — never shifted; a half-pitch stagger breaks foldability), y1 = y0+rib.
 *
 * `cornerShare` keys which ring corner each rib end abuts: corner c sits to the RIGHT of wall c,
 * so wall w meets corner w on its right and corner (w+3)%4 on its left.
 *
 * cornerMode is exactly {clear (default) | interlock}. clear = plain inset rectangle. interlock =
 * wide point / narrow notch per parity (see cornerModeEnds/ribPolygon).
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
      const width = faceWidth - 2 * ca;             // inset clear width
      const y0 = ribIndex * pitch;                  // SHARED datum — never shifted
      const y1 = y0 + rib;
      const depth = y1 - y0;
      const reach = cornerPointReach(depth, ca);
      const notchDepth = cornerNotchDepth(reach);   // = reach + CORNER_CLEARANCE
      const ends = cornerModeEnds(params.cornerMode ?? 'clear', wallIndex, ribIndex);
      const points = ribPolygon(width, depth, ends, reach, notchDepth);
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
 * PROVISIONAL 45deg bevel reach for a WIDE rib point: reach = min(cornerAllowance, depth/2), so
 * the two bevel edges are exactly 45deg to the draw for the default rib and clamp to the corner
 * zone otherwise (apex ABUTs the corner line, never crosses it). Paper-fold-gated.
 * @param {number} depth  rib depth along the draw (yBand.y1 - yBand.y0)
 * @param {number} cornerAllowance  per-side corner clear-zone width
 * @returns {number}
 */
export function cornerPointReach(depth, cornerAllowance) {
  return Math.min(cornerAllowance, depth / 2);
}

/**
 * PROVISIONAL notch depth for a NARROW rib end: reach + clearance, so the setback is DEEPER than
 * the mating point reaches by exactly the clearance gap (nominal seating: reach == notchDepth -
 * clearance). Paper-fold-gated.
 * @param {number} reach  from cornerPointReach()
 * @param {number} [clearance=CORNER_CLEARANCE]
 * @returns {number}
 */
export function cornerNotchDepth(reach, clearance = CORNER_CLEARANCE) {
  return reach + clearance;
}

/**
 * Interlock end roles for a rib. p = (wallIndex + ribIndex) % 2:
 *   even -> WIDE:   point at both corner ends.
 *   odd  -> NARROW: notch (setback) at both corner ends.
 * clear -> flat both ends (plain rectangle). Adjacent walls (wallIndex +-1) are opposite parity
 * at the same ribIndex, so every corner is exactly one point + one notch.
 * @param {'clear'|'interlock'} cornerMode
 * @param {number} wallIndex
 * @param {number} ribIndex
 * @returns {{leftKind:'flat'|'point'|'notch', rightKind:'flat'|'point'|'notch'}}
 */
export function cornerModeEnds(cornerMode, wallIndex, ribIndex) {
  if (cornerMode === 'interlock') {
    const wide = ((wallIndex + ribIndex) % 2) === 0;
    const kind = wide ? 'point' : 'notch';
    return { leftKind: kind, rightKind: kind };
  }
  return { leftKind: 'flat', rightKind: 'flat' }; // clear
}

/**
 * Canonical rib-local polygon, traced as a simple closed loop: top edge L->R, right end, bottom
 * edge R->L, left end. Each end is:
 *   'flat'  -> straight inset edge (no extra vertex)
 *   'point' -> convex apex reaching `reach` PAST the inset edge (x=width+reach / x=-reach), on the
 *              y-midline.
 *   'notch' -> concave reflex set BACK into the rib by `notchDepth` (x=width-notchDepth /
 *              x=notchDepth), on the y-midline.
 * A narrow (notch/notch) rib is a SIMPLE CONCAVE hexagon: reflex vertices at index 2 (right) and
 * index 5 (left). Consumers that assumed convex/monotone ribs (ladder traceColumn, STL cap fan)
 * must handle the concavity — see Tasks 3 and 4.
 * @param {number} width  inset clear width
 * @param {number} depth  rib depth along the draw
 * @param {{leftKind:'flat'|'point'|'notch', rightKind:'flat'|'point'|'notch'}} ends
 * @param {number} reach  convex apex reach (cornerPointReach)
 * @param {number} notchDepth  concave setback depth (cornerNotchDepth)
 * @returns {{x:number,y:number}[]}
 */
export function ribPolygon(width, depth, ends, reach, notchDepth) {
  const my = depth / 2; // apex/reflex sit on the rib y-midline (PROVISIONAL along-draw position)
  const pts = [{ x: 0, y: 0 }, { x: width, y: 0 }];
  if (ends.rightKind === 'point') {
    pts.push({ x: width + reach, y: my });        // convex apex (outward)
  } else if (ends.rightKind === 'notch') {
    pts.push({ x: width - notchDepth, y: my });   // concave reflex (inward setback)
  }
  pts.push({ x: width, y: depth }, { x: 0, y: depth });
  if (ends.leftKind === 'point') {
    pts.push({ x: -reach, y: my });               // convex apex (outward)
  } else if (ends.leftKind === 'notch') {
    pts.push({ x: notchDepth, y: my });           // concave reflex (inward setback)
  }
  return pts;
}

/**
 * Half of a split-W rib footprint (the seam bisects the W wall, so each half runs from the seam
 * to ONE corner). The seam edge stays flat; only the OUTER end (toward the corner) carries the
 * canonical WIDE apex, positioned from the full rib's apex. In clear mode (or for a narrow rib,
 * which has no outward apex) this returns a width/2 rectangle. Used only by the fabric ENGRAVE
 * footprints; concave notch routing there is out of scope (Task 7 annotates these half-marks).
 * @param {import('./types.js').RibShape} shape
 * @param {'left'|'right'} outer  which end abuts the corner (right for col 0, left for col 4)
 * @returns {{x:number,y:number}[]}
 */
export function halfRibPolygon(shape, outer) {
  const depth = shape.yBand.y1 - shape.yBand.y0;
  const hw = shape.width / 2;
  const rightApex = shape.points.find((p) => p.x > shape.width);
  const leftApex = shape.points.find((p) => p.x < 0);
  if (outer === 'right') {
    const pts = [{ x: 0, y: 0 }, { x: hw, y: 0 }];
    if (rightApex) pts.push({ x: hw + (rightApex.x - shape.width), y: depth / 2 }); // outer apex
    pts.push({ x: hw, y: depth }, { x: 0, y: depth });
    return pts;
  }
  // outer === 'left': corner at x=0, seam at x=hw
  const pts = [{ x: 0, y: 0 }, { x: hw, y: 0 }, { x: hw, y: depth }, { x: 0, y: depth }];
  if (leftApex) pts.splice(4, 0, { x: leftApex.x, y: depth / 2 }); // outer apex (leftApex.x < 0)
  return pts;
}
