// src/geometry/straight.js
import { LAYER } from '../constants.js';
import { computeMetrics } from './metrics.js';

/**
 * Build the flat PatternModel for a straight (parallel) bellows.
 * Expects params already normalized (rear=front, ribCount resolved).
 * @param {Object} params
 * @returns {import('./types.js').PatternModel}
 */
export function buildStraightPattern(params) {
  const W = params.frontW;
  const H = params.frontH;
  const ca = params.cornerAllowance;
  const rib = params.rib;
  const gap = params.gap;
  const endMargin = params.endMargin;
  const glueTab = params.glueTab;

  const metrics = computeMetrics(params);
  const { ribCount, N } = metrics;
  const p = metrics.pitch;

  const pleatedLength = metrics.flatPleatedLength;
  const flatLength = pleatedLength + 2 * endMargin;
  const flatWidth = 2 * (W + H) + glueTab;

  // Flat face layout: halfW | H | W | H | halfW  (+ glue tab)
  const faceWidths = [W / 2, H, W, H, W / 2];
  const faceKinds = ['HALF_FACE', 'FACE', 'FACE', 'FACE', 'HALF_FACE'];
  // Rib clear-zone insets [left, right]: seam edges get 0, corner edges get cornerAllowance.
  const faceInsets = [
    [0, ca],
    [ca, ca],
    [ca, ca],
    [ca, ca],
    [ca, 0],
  ];

  const faceX0 = [];
  let cursor = 0;
  for (let f = 0; f < faceWidths.length; f++) {
    faceX0.push(cursor);
    cursor += faceWidths[f];
  }
  // Tube corners = the four inner face boundaries.
  const cornerX = [faceX0[1], faceX0[2], faceX0[3], faceX0[4]];

  const segments = [];
  const regions = [];
  const seamFaceIndex = 0; // split W wall; seam at x=0, mid-wall.

  // Outer CUT boundary (whole sheet, glue tab included).
  segments.push({
    type: LAYER.CUT,
    layer: LAYER.CUT,
    closed: true,
    points: [
      { x: 0, y: 0 },
      { x: flatWidth, y: 0 },
      { x: flatWidth, y: flatLength },
      { x: 0, y: flatLength },
    ],
  });

  // Glue tab (mid-face closing seam), at the right extremity.
  const tabX0 = 2 * (W + H);
  regions.push({ kind: 'GLUE_TAB', faceIndex: 4, bbox: { x: tabX0, y: 0, w: glueTab, h: flatLength } });
  segments.push({
    type: LAYER.GLUE_TAB,
    layer: LAYER.GLUE_TAB,
    closed: false,
    points: [
      { x: tabX0, y: 0 },
      { x: tabX0, y: flatLength },
    ],
  });

  // Mounting end margins.
  regions.push({ kind: 'END_MARGIN', faceIndex: -1, bbox: { x: 0, y: 0, w: flatWidth, h: endMargin } });
  regions.push({ kind: 'END_MARGIN', faceIndex: -1, bbox: { x: 0, y: flatLength - endMargin, w: flatWidth, h: endMargin } });

  // Per-face regions, rib footprints, transverse fold lines.
  for (let f = 0; f < faceWidths.length; f++) {
    const x0 = faceX0[f];
    const w = faceWidths[f];
    const [insetL, insetR] = faceInsets[f];
    const zoneX0 = x0 + insetL;
    const zoneX1 = x0 + w - insetR;

    regions.push({ kind: faceKinds[f], faceIndex: f, bbox: { x: x0, y: endMargin, w, h: pleatedLength } });

    // Rib footprints (ENGRAVE), one per rib.
    for (let r = 0; r < ribCount; r++) {
      const ry0 = endMargin + r * p;
      const ry1 = ry0 + rib;
      segments.push({
        type: LAYER.ENGRAVE,
        layer: LAYER.ENGRAVE,
        closed: true,
        points: [
          { x: zoneX0, y: ry0 },
          { x: zoneX1, y: ry0 },
          { x: zoneX1, y: ry1 },
          { x: zoneX0, y: ry1 },
        ],
      });
    }

    // Transverse fold lines at gap centers; M/V by (pleat + face) parity.
    for (let i = 0; i < N; i++) {
      const fy = endMargin + rib + i * p + gap / 2;
      const mountain = ((i + f) % 2) === 0;
      const type = mountain ? LAYER.FOLD_MOUNTAIN : LAYER.FOLD_VALLEY;
      segments.push({
        type,
        layer: type,
        closed: false,
        points: [
          { x: zoneX0, y: fy },
          { x: zoneX1, y: fy },
        ],
      });
    }
  }

  // Longitudinal tube-corner folds (mountain edges), full pleated length.
  for (const cx of cornerX) {
    segments.push({
      type: LAYER.FOLD_MOUNTAIN,
      layer: LAYER.FOLD_MOUNTAIN,
      closed: false,
      points: [
        { x: cx, y: endMargin },
        { x: cx, y: endMargin + pleatedLength },
      ],
    });
  }

  // 45-degree corner-miter diagonals: one per pleat per corner.
  // P6 fix: clamp the diagonal REACH so its total rise (2*reach) never exceeds the pleat
  //   pitch. Was 2*ca = 30mm, overrunning the 14.5mm pitch and sweeping through the rib
  //   bands; reach = min(cornerAllowance, pitch/2) keeps a true 45deg crease that fits
  //   inside one gap, with horizontal reach still confined to the cornerAllowance zone.
  // P7 fix: tilt sense derives from (ribIndex + cornerIndex) parity, matching the M/V
  //   type. Using i alone made the diagonal tilt backwards at 2 of the 4 corners.
  // PROVISIONAL: the exact bevel reach into the corner zone is paper-fold-gated
  //   (design spec sec 4/5) — the construction rule (45deg, rise <= pitch, tilt by (i+c))
  //   is fixed here; the precise reach is tuned against a printed fold.
  const reach = Math.min(ca, p / 2);
  for (let c = 0; c < cornerX.length; c++) {
    const cx = cornerX[c];
    for (let i = 0; i < N; i++) {
      const fy = endMargin + rib + i * p + gap / 2;
      const mountain = ((i + c) % 2) === 0;
      const dir = mountain ? 1 : -1;
      const type = mountain ? LAYER.FOLD_MOUNTAIN : LAYER.FOLD_VALLEY;
      segments.push({
        type,
        layer: type,
        closed: false,
        points: [
          { x: cx - reach, y: fy - dir * reach },
          { x: cx + reach, y: fy + dir * reach },
        ],
      });
      regions.push({
        kind: 'CORNER_MITER',
        faceIndex: c,
        bbox: { x: cx - reach, y: fy - reach, w: 2 * reach, h: 2 * reach },
      });
    }
  }

  return {
    segments,
    regions,
    seamFaceIndex,
    bounds: { w: flatWidth, h: flatLength },
    metrics,
  };
}
