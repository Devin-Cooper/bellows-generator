// src/geometry/fold.js
import { computeMetrics } from './metrics.js';

/**
 * Build the folded 3D shell (straight pleated bellows) at extension t.
 *
 * The shell is a concertina of octagonal cross-section rings: rib rings sit at
 * the tube "waist", ridge rings bulge outward between them. The radial bulge is
 * derived from a fixed material slant (the extended half-pitch), so as the axial
 * length shrinks toward the collapsed thickness the pleats fan out, and as it
 * grows toward the usable draw they flatten into a straight tube.
 *
 * @param {object} params
 * @param {number} t extension in [0,1]; clamped.
 * @returns {import('./types.js').FoldModel}
 */
export function buildFoldModel(params, t) {
  const metrics = computeMetrics(params);
  const ribCount = metrics.ribCount;
  const clampedT = Math.max(0, Math.min(1, t));

  const collapsed = metrics.collapsedThickness; // axial length at t=0
  const extended = metrics.usableDraw; // axial length at t=1
  const axialLength = collapsed + (extended - collapsed) * clampedT;

  // Rib rings interleaved with ridge rings between each pair of ribs.
  const ringCount = 2 * ribCount - 1;
  // segCount = ringCount - 1; Math.max(1, ...) is a guard but valid params require ribCount >= 2.
  const segCount = Math.max(1, ringCount - 1);

  // Cross-section half extents; the front opening drives the straight preview.
  const a = params.frontW / 2;
  const b = params.frontH / 2;
  // Corner chamfer of the octagon cross-section. This is a VISUAL softening of the folded corner,
  // NOT the full unstiffened corner-allowance zone: the assembled corner is a near-sharp fold whose
  // 45° miter crease only reaches `min(cornerAllowance, pitch/2)` into each face (the same clamp the
  // flat pattern uses — see straight.js/tapered.js `reach`). Capping the chamfer there keeps the
  // preview opening close to the true frontW×frontH: a large corner allowance can no longer shrink
  // the facet toward the (much smaller) stiffened-rib width. The a*0.9/b*0.9 term is the pre-existing
  // safety clamp so octagon vertices never cross the centre line on tiny openings.
  const miter = Math.min(params.cornerAllowance, metrics.pitch / 2, a * 0.9, b * 0.9);

  // Fixed material half-pitch (slant); radial peak collapses to 0 at full draw.
  const slant = extended / segCount;
  const axialPitch = axialLength / segCount;
  const peak = Math.sqrt(Math.max(0, slant * slant - axialPitch * axialPitch));

  const V = 8;
  const positions = [];
  const indices = [];

  for (let j = 0; j < ringCount; j++) {
    const isRidge = j % 2 === 1;
    const bulge = isRidge ? peak : 0;
    const ax = a + bulge;
    const bx = b + bulge;
    const z = (j / segCount) * axialLength;
    // Octagon: W×H rectangle with four corner miters, wound counter-clockwise.
    const ring = [
      [-ax + miter, -bx],
      [ax - miter, -bx],
      [ax, -bx + miter],
      [ax, bx - miter],
      [ax - miter, bx],
      [-ax + miter, bx],
      [-ax, bx - miter],
      [-ax, -bx + miter],
    ];
    for (const [x, y] of ring) positions.push(x, y, z);
  }

  // Tube walls: two triangles per quad between consecutive rings.
  for (let j = 0; j < segCount; j++) {
    const base = j * V;
    const next = (j + 1) * V;
    for (let k = 0; k < V; k++) {
      const k1 = (k + 1) % V;
      const A = base + k;
      const B = base + k1;
      const C = next + k1;
      const D = next + k;
      indices.push(A, B, C, A, C, D);
    }
  }

  // End caps: fan-triangulate the terminal octagons.
  // Winding is REVERSED relative to the adjacent wall quads so that cap normals
  // point outward (away from the tube interior), matching the wall normals.
  // Each cap's boundary edges must run opposite to the wall boundary edges;
  // reversing the winding achieves this for a CCW-from-+z tube.
  const first = 0;
  const last = (ringCount - 1) * V;
  for (let k = 1; k < V - 1; k++) {
    indices.push(first, first + k + 1, first + k);
    indices.push(last, last + k, last + k + 1);
  }

  return { positions, indices, axialLength, extension: clampedT };
}
