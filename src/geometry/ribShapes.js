// src/geometry/ribShapes.js
// Interlock corner geometry (cornerMode 'interlock'): each rib is a CONVEX isosceles TRAPEZOID
// that carries HALF a corner point. The apex sits ON a band edge — the GAP BOUNDARY, y=0 or
// y=depth in rib-local coords, a half-gap (gap/2) SHORT of the actual crease — NOT on the crease
// and NOT at mid-depth. Per rib parity p=(wallIndex+ribIndex)%2 the ORIENTATION flips:
//   p even -> 'leading' : long/pointing edge on y=0, short cut-off edge on y=depth.
//   p odd  -> 'rear'    : long/pointing edge on y=depth, short cut-off edge on y=0.
// `reach` projects the point past the clear-width edge at a band edge; `setback` insets the short
// cut-off edge at the OPPOSITE band edge. Adjacent walls (wallIndex differs by 1) and consecutive
// ribs (same wall) are opposite parity -> opposite orientation, so their half-diagonals FACE each
// other across the centred gap (each rib holds half a point) but do NOT meet on the crease: the
// transverse fold runs down the MIDDLE of the gap between them, so the two facing tips sit a full
// gap apart and must not touch. (straight.js draws that fold at the gap centre = band-edge+gap/2
// by design.) Square: reach==setback
// (45deg). Tapered: reach!=setback (the Wide/Narrow end-angles sum to 90deg). The exact reach /
// setback / clearance / taper end-angle split / absolute phase are PROVISIONAL and paper-fold-
// gated; tests assert the CONSTRUCTION RULE only, not ground-truth coordinates.
// See docs .../plans/2026-07-05-round2-geometry-and-sheets.md.
import { computeMetrics } from './metrics.js';
import { computeFaceFoldWidths } from './tapered.js';

// A rectangular ring has FOUR walls (two W, two H), traversed W, H, W, H.
const WALL_FACES = ['W', 'H', 'W', 'H'];

// PROVISIONAL corner tip-clearance (mm), RESERVED / NOT YET WIRED. The contract's clearance
// construction rule ("setback slightly deeper than the mating reach") is DEFERRED to the human
// paper-fold gate: cornerReachSetback intentionally returns setback==reach on a square, so this
// constant is NOT yet folded into setback. It is a derived quantity (NOT a UI param) kept
// exported for consumers/tests; when the 1:1 paper fold pins the numbers, setback becomes
// base - taper + CORNER_CLEARANCE (and the square assertion relaxes to setback>=reach). Until
// then the geometry is construction-correct but the clearance is dimension-provisional.
export const CORNER_CLEARANCE = 0.5;

// Minimum gap (mm) kept between the setback cap and width/2. Clamping setback to EXACTLY width/2
// coincides the two short-edge vertices ({setback,y} and {width-setback,y}) into a single point,
// yielding a degenerate duplicate-vertex trapezoid whose STL cap triangles have zero area (hits
// sub-~43mm interlock faces). Capping strictly below width/2 keeps width-setback > setback, so the
// short cut-off edge — and its STL cap — stays non-degenerate.
export const SETBACK_MIN_GAP = 1e-3;

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
 * a convex trapezoid whose orientation flips with parity (see cornerModeEnds/ribPolygon).
 *
 * @param {Object} params  Normalized or raw params (computeFaceFoldWidths normalizes).
 * @returns {import('./types.js').RibShape[]}
 */
export function computeRibShapes(params) {
  const { ribCount, pitch } = computeMetrics(params);
  const rib = params.rib;
  const ca = params.cornerAllowance;
  if ((params.cornerMode ?? 'clear') === 'interlock-full' && ca > rib / 2) {
    console.warn(
      `interlock-full: cornerAllowance (${ca}) > rib/2 (${rib / 2}) — corner fill capped at 45° and ` +
        `short of the fold by ${(ca - rib / 2).toFixed(1)}mm; reduce cornerAllowance or increase rib`
    );
  }
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
      // PROVISIONAL tapered asymmetry: half the local fold-width slope, so a Wide pleat's
      // half-point reaches further and a Narrow pleat sets back more (the two corner end-angles
      // sum to 90deg on a square, tilt on a taper). Zero for straight (all folds equal).
      const prevW = foldWidths[Math.max(ribIndex - 1, 0)];
      const nextW = foldWidths[Math.min(ribIndex + 1, ribCount - 1)];
      const taper = (prevW - nextW) / 8;
      const mode = params.cornerMode ?? 'clear';
      const ends = cornerModeEnds(mode, wallIndex, ribIndex);
      let points;
      if (mode === 'interlock-full') {
        points = ribPolygonFull(width, depth, ends, cornerFullParams(depth, ca, width));
      } else {
        let { reach, setback } = cornerReachSetback(depth, ca, taper);
        // Degeneracy guards (paper-fold-gated, NOT the old notch clamp): the point fits inside the
        // corner-fold gap (reach <= cornerAllowance) and the short cut-off edge stays non-negative
        // (width >= 2*setback), both non-negative.
        reach = Math.max(0, Math.min(reach, ca));
        // Cap strictly BELOW width/2 (not at it): a setback of exactly width/2 coincides the two
        // short-edge vertices into a duplicate-vertex (zero-area-cap) trapezoid. Normal faces
        // (width >> 2*setback) keep the clamp inactive and are unchanged.
        setback = Math.max(0, Math.min(setback, width / 2 - SETBACK_MIN_GAP));
        points = ribPolygon(width, depth, ends, reach, setback);
      }
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
 * PROVISIONAL half-point projection for an interlock trapezoid end. Returns BOTH the `reach` (how
 * far the acute point projects PAST the clear-width edge, measured at a band edge) and the
 * `setback` (how far the short cut-off edge insets at the OPPOSITE band edge). The base is the
 * 45deg square value (reach==setback==min(cornerAllowance, depth/2), clamped so the point never
 * overruns the corner-fold gap). A tapered corner splits the base by `taper`: the Wide end reaches
 * `base+taper`, the Narrow end sets back to `base-taper`, so the two mating end-angles sum to
 * 90deg. Replaces the old cornerPointReach mid-depth-apex semantics. NOTE: CORNER_CLEARANCE is
 * intentionally NOT applied here (deferred to the paper-fold gate); setback==reach on a square.
 * Paper-fold-gated.
 * @param {number} depth  rib depth along the draw (yBand.y1 - yBand.y0)
 * @param {number} cornerAllowance  per-side corner clear-zone width
 * @param {number} [taper=0]  tapered Wide/Narrow asymmetry (0 for a square)
 * @returns {{reach:number, setback:number}}
 */
export function cornerReachSetback(depth, cornerAllowance, taper = 0) {
  const base = Math.min(cornerAllowance, depth / 2);
  return { reach: base + taper, setback: base - taper };
}

/**
 * interlock-full corner parameters: the rib fills the corner facet up to the 45deg miter and
 * reaches the fold. reach = base (=min(ca,depth/2)); the mating cut-off `setback` is DEEPENED by
 * CORNER_CLEARANCE (per the CORNER_CLEARANCE note) then clamped; `h` is the fold-hug height, and
 * the tips sit CORNER_CLEARANCE inside each fold. When h<=0 (ca>=rib/2) the shape collapses to a
 * trapezoid (see ribPolygonFull). Straight/square only (taper reserved). PROVISIONAL / paper-fold-gated.
 * @returns {{reach:number,setback:number,h:number,xTipL:number,xTipR:number}}
 */
export function cornerFullParams(depth, cornerAllowance, width) {
  const base = Math.min(cornerAllowance, depth / 2);
  const cl = CORNER_CLEARANCE;
  const reach = base;
  const setback = Math.max(0, Math.min(base + cl, width / 2 - SETBACK_MIN_GAP));
  const h = Math.max(0, Math.min(depth - setback - reach + cl, depth));
  return { reach, setback, h, xTipL: cl - reach, xTipR: width + reach - cl };
}

/**
 * interlock-full rib polygon. h>0 -> convex CCW HEXAGON with two mid-band fold-hug vertices at y=h
 * (leading) / y=depth-h (rear); h<=0 -> the 4-vertex trapezoid (same as a fold-reaching interlock).
 * @param {{orientation:'leading'|'rear'}} ends
 * @param {{reach:number,setback:number,h:number,xTipL:number,xTipR:number}} p
 * @returns {{x:number,y:number}[]}
 */
export function ribPolygonFull(width, depth, ends, p) {
  const { setback: s, h, xTipL, xTipR } = p;
  const leading = ends.orientation === 'leading';
  if (h <= 0) {
    const base = leading
      ? [{ x: xTipL, y: 0 }, { x: xTipR, y: 0 }, { x: width - s, y: depth }, { x: s, y: depth }]
      : [{ x: s, y: 0 }, { x: width - s, y: 0 }, { x: xTipR, y: depth }, { x: xTipL, y: depth }];
    return base;
  }
  if (leading) {
    return [
      { x: xTipL, y: 0 }, { x: xTipR, y: 0 }, { x: xTipR, y: h },
      { x: width - s, y: depth }, { x: s, y: depth }, { x: xTipL, y: h },
    ];
  }
  return [
    { x: s, y: 0 }, { x: width - s, y: 0 }, { x: xTipR, y: depth - h },
    { x: xTipR, y: depth }, { x: xTipL, y: depth }, { x: xTipL, y: depth - h },
  ];
}

/**
 * Interlock trapezoid orientation for a rib. p = (wallIndex + ribIndex) % 2:
 *   even -> 'leading' : long/pointing edge on y=0.
 *   odd  -> 'rear'    : long/pointing edge on y=depth.
 * Both corner ends of a rib share the SAME orientation (one trapezoid). clear -> null (plain
 * inset rectangle). Adjacent walls (wallIndex +-1) are opposite parity at the same ribIndex, so
 * every corner pairs a 'leading' half-diagonal with a 'rear' half-diagonal — the two halves FACE
 * each other across the centred gap (crease down its middle, a full gap apart) and must not touch.
 * @param {'clear'|'interlock'} cornerMode
 * @param {number} wallIndex
 * @param {number} ribIndex
 * @returns {{orientation:'leading'|'rear'|null}}
 */
export function cornerModeEnds(cornerMode, wallIndex, ribIndex) {
  if (cornerMode === 'interlock-full') {
    // FLIPPED vs interlock: leading iff (w+r) ODD. The even choice puts the tip on the
    // intruding side of the corner miter and locks the fold (derivation, adversarial-confirmed).
    const orientation = ((wallIndex + ribIndex) % 2) === 1 ? 'leading' : 'rear';
    return { orientation };
  }
  if (cornerMode === 'interlock') {
    const orientation = ((wallIndex + ribIndex) % 2) === 0 ? 'leading' : 'rear';
    return { orientation };
  }
  return { orientation: null }; // clear
}

/**
 * Canonical rib-local polygon — a convex, CCW (positive-area), 4-vertex shape:
 *   orientation null      -> plain inset rectangle [(0,0),(width,0),(width,depth),(0,depth)].
 *   orientation 'leading' -> long edge on y=0:    [(-reach,0),(width+reach,0),(width-setback,depth),(setback,depth)].
 *   orientation 'rear'    -> long edge on y=depth: [(setback,0),(width-setback,0),(width+reach,depth),(-reach,depth)].
 * Each corner end is ONE straight diagonal (half a peak); the apex sits on a band edge (y in
 * {0,depth}), never at mid-depth, and there is NO reflex/concave vertex. Convex, so consumers
 * (ladder traceColumn, STL earClip cap, fabric footprints) flow through unchanged.
 * @param {number} width  inset clear width
 * @param {number} depth  rib depth along the draw
 * @param {{orientation:'leading'|'rear'|null}} ends
 * @param {number} reach  point projection past the clear edge
 * @param {number} setback  short cut-off edge inset at the opposite edge
 * @returns {{x:number,y:number}[]}
 */
export function ribPolygon(width, depth, ends, reach, setback) {
  const orientation = ends.orientation ?? null;
  if (orientation === 'leading') {
    return [
      { x: -reach, y: 0 },
      { x: width + reach, y: 0 },
      { x: width - setback, y: depth },
      { x: setback, y: depth },
    ];
  }
  if (orientation === 'rear') {
    return [
      { x: setback, y: 0 },
      { x: width - setback, y: 0 },
      { x: width + reach, y: depth },
      { x: -reach, y: depth },
    ];
  }
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: depth },
    { x: 0, y: depth },
  ];
}

/**
 * Half of a split-W rib footprint (the seam bisects the W wall, so each half runs from the seam
 * to ONE corner). The seam edge stays flat; only the OUTER end (toward the corner) carries the
 * canonical half-trapezoid DIAGONAL (reach at one band edge, setback at the other), read from the
 * full rib's corner-side edge. In clear mode this returns a width/2 rectangle. Used by the fabric
 * ENGRAVE footprints.
 * @param {import('./types.js').RibShape} shape
 * @param {'left'|'right'} outer  which end abuts the corner (right for col 0, left for col 4)
 * @returns {{x:number,y:number}[]}
 */
export function halfRibPolygon(shape, outer) {
  const depth = shape.yBand.y1 - shape.yBand.y0;
  const hw = shape.width / 2;
  // Full rib's left/right x at each band edge (2+ vertices at y=0, 2+ at y=depth).
  const y0 = shape.points.filter((p) => Math.abs(p.y) < 1e-6).map((p) => p.x);
  const yd = shape.points.filter((p) => Math.abs(p.y - depth) < 1e-6).map((p) => p.x);
  const leftTop = Math.min(...y0);
  const rightTop = Math.max(...y0);
  const leftBot = Math.min(...yd);
  const rightBot = Math.max(...yd);
  // Mid-band fold-hug vertices (interlock-full). EMPTY for a 4-vertex trapezoid -> byte-identical.
  const mid = shape.points.filter((p) => p.y > 1e-6 && p.y < depth - 1e-6);
  if (outer === 'right') {
    // corner on the RIGHT (x=hw), seam flat on the LEFT (x=0); carry the corner-side (right) chain
    // top->bottom through x -> hw + (x - width).
    const rmid = mid
      .filter((p) => p.x > shape.width / 2)
      .sort((a, b) => a.y - b.y)
      .map((p) => ({ x: hw + (p.x - shape.width), y: p.y }));
    return [
      { x: 0, y: 0 },
      { x: hw + (rightTop - shape.width), y: 0 },
      ...rmid,
      { x: hw + (rightBot - shape.width), y: depth },
      { x: 0, y: depth },
    ];
  }
  // outer === 'left': corner on the LEFT (x=0), seam flat on the RIGHT (x=hw); the left diagonal
  // x-values carry directly; the fold-hug sits on the closing left edge (append it bottom->top).
  const lmid = mid
    .filter((p) => p.x < shape.width / 2)
    .sort((a, b) => b.y - a.y)
    .map((p) => ({ x: p.x, y: p.y }));
  return [
    { x: leftTop, y: 0 },
    { x: hw, y: 0 },
    { x: hw, y: depth },
    { x: leftBot, y: depth },
    ...lmid,
  ];
}
