// src/geometry/wallRibLayout.js
// Whole-rib fabric placement for the 4 walls of the ring, unrolled (W, H, W, H). A SHARED
// foundation for the full/flat STL (Feature B, consumes the unrolled x verbatim) and the rib
// master sheet (Feature C, keeps the rib SETS but overrides x with a 2D bed packer). It reuses
// ONLY the per-rib positioning math (y / width / points) from computeRibShapes + the fold widths;
// it does NOT refactor the straight/tapered ENGRAVE loops (that is the cloth, unchanged). Ribs
// are ALWAYS WHOLE here (never the split-W halves) — the fabric seam is a cloth concern only.
import { computeMetrics } from './metrics.js';
import { computeFaceFoldWidths } from './tapered.js';
import { computeRibShapes } from './ribShapes.js';

// A rectangular ring has FOUR walls (two W, two H), traversed W, H, W, H.
const WALL_FACES = ['W', 'H', 'W', 'H'];

/**
 * Lay the 4 whole walls out unrolled along +x, each rib band at the shared datum along +y.
 * `x` advances by cumulative FULL-face widths (the widest pleat per wall), leaving a
 * cornerAllowance corner-fold zone on each side of every panel; the whole rib clear width
 * (faceWidth - 2*cornerAllowance) is centred on its wall's fold centreline. `y = endMargin +
 * ribIndex*pitch` (the shared, un-shifted datum + fabric origin). `points` are the corrected
 * trapezoids from computeRibShapes; their reach/setback project into the corner-fold gap where
 * adjacent walls' half-points nest to form the shared corner point.
 *
 * @param {Object} params  Normalized or raw params (downstream helpers normalize).
 * @returns {{face:'W'|'H', wallIndex:number, ribIndex:number, x:number, y:number, width:number, points:{x:number,y:number}[]}[]}
 */
export function computeWallRibLayout(params) {
  const { ribCount, pitch } = computeMetrics(params);
  const ca = params.cornerAllowance;
  const endMargin = params.endMargin;
  const { width: wFold, height: hFold } = computeFaceFoldWidths(params);
  const shapes = computeRibShapes(params);
  const shapeAt = (wallIndex, ribIndex) =>
    shapes.find((s) => s.wallIndex === wallIndex && s.ribIndex === ribIndex);

  const out = [];
  let faceLeft = 0; // running left edge of the current wall panel (full-face footprint)
  for (let wallIndex = 0; wallIndex < WALL_FACES.length; wallIndex++) {
    const face = WALL_FACES[wallIndex];
    const foldWidths = face === 'W' ? wFold : hFold;
    const fullFace = Math.max(...foldWidths); // widest pleat = this wall's x-footprint
    for (let ribIndex = 0; ribIndex < ribCount; ribIndex++) {
      const shape = shapeAt(wallIndex, ribIndex);
      const width = shape.width;                    // whole clear width = faceWidth - 2*ca
      const x = faceLeft + (fullFace - width) / 2;  // centre the whole rib on the fold centreline
      const y = endMargin + ribIndex * pitch;       // shared datum + fabric endMargin origin
      out.push({ face, wallIndex, ribIndex, x, y, width, points: shape.points });
    }
    faceLeft += fullFace; // next wall panel abuts at the shared corner fold
  }
  return out;
}
