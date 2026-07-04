// src/geometry/types.js
// Pure-geometry data contracts. JSDoc only — no runtime exports.
// Coordinate convention: origin at top-left of the flat sheet, +x right, +y down. Units are mm.

/**
 * @typedef {Object} Segment
 * @property {string} type   One of LAYER (CUT|FOLD_MOUNTAIN|FOLD_VALLEY|ENGRAVE|GLUE_TAB).
 * @property {{x:number,y:number}[]} points  Polyline/polygon vertices in mm.
 * @property {boolean} closed  True if the last point connects back to the first.
 * @property {string} layer  Same value as `type`; kept explicit for the SVG `<g>` grouping.
 */

/**
 * @typedef {Object} Region
 * @property {'FACE'|'HALF_FACE'|'CORNER_MITER'|'END_MARGIN'|'GLUE_TAB'} kind
 * @property {number} faceIndex  Index of the owning flat face (-1 when not face-scoped).
 * @property {{x:number,y:number,w:number,h:number}} bbox  Axis-aligned bounds in mm.
 */

/**
 * @typedef {Object} Metrics
 * @property {number} N  Pleat/gap count (= ribCount - 1).
 * @property {number} ribCount
 * @property {number} pitch  rib + gap.
 * @property {number} flatPleatedLength  pitch*N + rib.
 * @property {number} usableDraw  maxDraw - 2*pitch (one lost pleat per end).
 * @property {number} collapsedThickness  ribCount*(ribThickness + fabricThickness).
 * @property {{w:number,h:number}} flatSheet  Material-planning extents in mm.
 * @property {number} magnification  (usableDraw + opticalOffset)/focalLength - 1.
 * @property {string[]} warnings
 */

/**
 * @typedef {Object} PatternModel
 * @property {Segment[]} segments
 * @property {Region[]} regions
 * @property {number} seamFaceIndex  Flat face carrying the mid-wall closing seam.
 * @property {{w:number,h:number}} bounds  Flat-sheet bounds in mm.
 * @property {Metrics} metrics
 */

/**
 * @typedef {Object} FoldModel
 * @property {number[]} positions  Flat vertex buffer: x,y,z,x,y,z,...
 * @property {number[]} indices  Triangle indices into `positions`.
 * @property {number} axialLength  Along-axis length at the current extension.
 * @property {number} extension  t in [0,1].
 */

/**
 * @typedef {Object} RibShape
 * @property {'W'|'H'} face  Which tube face this rib stiffens.
 * @property {number} wallIndex  0..3 around the ring (W,H,W,H).
 * @property {number} ribIndex  0..ribCount-1 along the draw (maps to the pleat for taper).
 * @property {{leftCorner:number,rightCorner:number}} cornerShare  Ring corners this rib abuts.
 * @property {number} width  Inset clear width = faceWidth - 2*cornerAllowance (mm).
 * @property {{y0:number,y1:number}} yBand  Along-draw band vs the pleated-length datum (mm).
 * @property {{x:number,y:number}[]} points  Canonical rib-local polygon: +x across width (0..width), +y along draw (0..rib).
 */

export {};
