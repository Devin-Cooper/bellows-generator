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
