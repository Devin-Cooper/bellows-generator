// src/geometry/cornerCombs.js
// Optional corner-gap "combs": one per tube corner. A comb is a centipede — a narrow spine that
// lands on the corner fold (local x = cornerAllowance), with one tooth per pleat facet splaying
// across the 2*cornerAllowance gap onto both walls. It folds via a longitudinal corner score plus
// one transverse score per pleat crease. Pure geometry in a LOCAL frame (x = across the gap, y =
// along the length); the master-sheet packer positions/rotates each comb. See the design spec.
import { normalizeParams } from '../params.js';
import { computeMetrics } from './metrics.js';
import { LAYER } from '../constants.js';

export const COMB_SPINE_WIDTH = 3; // mm, the narrow connecting backbone on the corner fold

/**
 * Build the 4 corner-gap combs (or [] when cornerCombs is off).
 * @param {Object} params
 * @returns {{cornerIndex:number,f:number,outline:{x,y}[],teeth:{x0,x1,y0,y1}[],
 *            scores:{type:string,points:{x,y}[]}[],bbox:{w:number,h:number},label:string}[]}
 */
export function computeCornerCombs(params) {
  const p = normalizeParams(params);
  if (!p.cornerCombs) return [];

  const ca = p.cornerAllowance;
  const rib = p.rib;
  const gap = p.gap;
  const tw = p.combToothWidth;
  const { ribCount, N, pitch, flatPleatedLength: L } = computeMetrics(p);

  const spineLeft = ca - COMB_SPINE_WIDTH / 2;
  const spineRight = ca + COMB_SPINE_WIDTH / 2;

  // Teeth: one per facet, centered in the rib zone, full gap width [0, 2*ca].
  const teeth = [];
  for (let r = 0; r < ribCount; r++) {
    const cy = r * pitch + rib / 2;
    teeth.push({ x0: 0, x1: 2 * ca, y0: cy - tw / 2, y1: cy + tw / 2 });
  }

  // Rectilinear union outline of {spine strip} ∪ {teeth}: down the left profile, up the right.
  const outline = [];
  outline.push({ x: spineLeft, y: 0 });
  for (const t of teeth) {
    outline.push({ x: spineLeft, y: t.y0 });
    outline.push({ x: 0, y: t.y0 });
    outline.push({ x: 0, y: t.y1 });
    outline.push({ x: spineLeft, y: t.y1 });
  }
  outline.push({ x: spineLeft, y: L });
  outline.push({ x: spineRight, y: L });
  for (let i = teeth.length - 1; i >= 0; i--) {
    const t = teeth[i];
    outline.push({ x: spineRight, y: t.y1 });
    outline.push({ x: 2 * ca, y: t.y1 });
    outline.push({ x: 2 * ca, y: t.y0 });
    outline.push({ x: spineRight, y: t.y0 });
  }
  outline.push({ x: spineRight, y: 0 });

  const bbox = { w: 2 * ca, h: L };

  const combs = [];
  for (let cornerIndex = 0; cornerIndex < 4; cornerIndex++) {
    const f = cornerIndex + 1; // the abutting (higher-index) column at this corner (M/V hint phase)
    const scores = [];
    // Longitudinal corner fold (static 90 deg), always MOUNTAIN, full length.
    scores.push({ type: LAYER.FOLD_MOUNTAIN, points: [{ x: ca, y: 0 }, { x: ca, y: L }] });
    // Transverse accordion scores across the spine at each crease; M/V hint by (i+f) parity.
    for (let i = 0; i < N; i++) {
      const y = rib + i * pitch + gap / 2;
      const mountain = ((i + f) % 2) === 0;
      scores.push({
        type: mountain ? LAYER.FOLD_MOUNTAIN : LAYER.FOLD_VALLEY,
        points: [{ x: spineLeft, y }, { x: spineRight, y }],
      });
    }
    combs.push({ cornerIndex, f, outline, teeth, scores, bbox, label: `corner ${cornerIndex + 1} comb` });
  }
  return combs;
}
