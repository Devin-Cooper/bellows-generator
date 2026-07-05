export const LAYER = {
  CUT: 'CUT',
  FOLD_MOUNTAIN: 'FOLD_MOUNTAIN',
  FOLD_VALLEY: 'FOLD_VALLEY',
  ENGRAVE: 'ENGRAVE',
  GLUE_TAB: 'GLUE_TAB',
};

// LightBurn-palette hexes — stroke color is the load-bearing cut/score/engrave contract.
export const LAYER_COLORS = {
  CUT: '#FF0000',
  FOLD_MOUNTAIN: '#0000FF',
  FOLD_VALLEY: '#00AA00',
  ENGRAVE: '#000000',
  GLUE_TAB: '#FF00FF',
};

export const pitch = (p) => p.rib + p.gap;

// Fabric-guide annotation for the two split-W half-marks (columns 0 & 4). Lives in this NEUTRAL
// module (not straight.js) so BOTH straight.js and tapered.js can import it without forming a
// straight <-> tapered cycle: straight.js -> ribShapes.js -> tapered.js, so a tapered.js ->
// straight.js import would close the loop. These ENGRAVE footprints are SEAM-ALIGNMENT guides on
// the unrolled flat sheet, NOT two cut pieces: the two halves sit at opposite x-ends of the sheet
// (col 0 at x~0, col 4 at the far edge) and reunite only when the tube is wrapped, so a single
// spanning rectangle cannot be drawn on the flat pattern. The note tells the builder they are one
// whole strip taken from the rib ladder. Metadata only — renderPatternSVG reads points/type/
// closed, never `annotation`.
export const WHOLE_STRIP_NOTE = 'one whole strip — cut from the rib ladder';
