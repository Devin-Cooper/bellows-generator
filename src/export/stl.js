// src/export/stl.js
import { normalizeParams } from '../params.js';
import { computeMetrics } from '../geometry/metrics.js';
import { computeFaceFoldWidths } from '../geometry/tapered.js';

/**
 * One outline per rib line: a trapezoid strip `rib` deep whose two transverse widths
 * differ by the width taper accrued over the rib depth (w0 == w1 for straight).
 * Rib count is taken from model.metrics.ribCount (the locked contract). Width falls
 * back to (frontW - 2*cornerAllowance) when a per-rib fold width is unavailable.
 * @param {import('../geometry/types.js').PatternModel} model
 * @param {Object} params
 * @returns {{w0:number,w1:number,depth:number,thickness:number}[]}
 */
export function computeRibOutlines(model, params) {
  const p = normalizeParams(params);
  const n = model.metrics.ribCount;
  let width = [];
  try {
    width = computeFaceFoldWidths(p).width || [];
  } catch {
    width = [];
  }
  const fallback = p.frontW - 2 * p.cornerAllowance;
  const flatLen = computeMetrics(p).flatPleatedLength;
  const perRib = flatLen > 0 ? (((p.rearW - p.frontW) || 0) / flatLen) * p.rib : 0;
  const outlines = [];
  for (let i = 0; i < n; i++) {
    const wi = width[i] != null ? width[i] : fallback;
    outlines.push({
      w0: wi + perRib / 2,
      w1: wi - perRib / 2,
      depth: p.rib,
      thickness: p.ribThickness,
    });
  }
  return outlines;
}

/**
 * Binary STL of the stiffener ribs as independent watertight trapezoid boxes.
 * @param {import('../geometry/types.js').PatternModel} model
 * @param {Object} params
 * @returns {ArrayBuffer} triangle count === 12 * ribCount
 */
export function exportRibsSTL(model, params) {
  const p = normalizeParams(params);
  const outlines = computeRibOutlines(model, p);
  const triCount = outlines.length * 12;
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

  outlines.forEach((o, i) => {
    const y0 = i * (o.depth + p.gap);
    const y1 = y0 + o.depth;
    const z0 = 0, z1 = o.thickness;
    const a0 = o.w0 / 2, a1 = o.w1 / 2;
    const A = [-a0, y0, z0], B = [a0, y0, z0], C = [a1, y1, z0], D = [-a1, y1, z0];
    const E = [-a0, y0, z1], F = [a0, y0, z1], G = [a1, y1, z1], H = [-a1, y1, z1];
    tri(A, C, B); tri(A, D, C);        // bottom
    tri(E, F, G); tri(E, G, H);        // top
    tri(A, B, F); tri(A, F, E);        // rear side (y0)
    tri(B, C, G); tri(B, G, F);        // right side
    tri(C, D, H); tri(C, H, G);        // front side (y1)
    tri(D, A, E); tri(D, E, H);        // left side
  });

  return buf;
}
