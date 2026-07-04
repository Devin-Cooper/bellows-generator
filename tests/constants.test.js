import { describe, it, expect } from 'vitest';
import { LAYER, LAYER_COLORS, pitch } from '../src/constants.js';

describe('constants', () => {
  it('defines the five layer keys as self-named strings', () => {
    expect(LAYER).toEqual({
      CUT: 'CUT',
      FOLD_MOUNTAIN: 'FOLD_MOUNTAIN',
      FOLD_VALLEY: 'FOLD_VALLEY',
      ENGRAVE: 'ENGRAVE',
      GLUE_TAB: 'GLUE_TAB',
    });
  });

  it('pins a LightBurn-palette hex per layer', () => {
    expect(LAYER_COLORS).toEqual({
      CUT: '#FF0000',
      FOLD_MOUNTAIN: '#0000FF',
      FOLD_VALLEY: '#00AA00',
      ENGRAVE: '#000000',
      GLUE_TAB: '#FF00FF',
    });
  });

  it('pitch = rib + gap', () => {
    expect(pitch({ rib: 12, gap: 2.5 })).toBe(14.5);
    expect(pitch({ rib: 10, gap: 5 })).toBe(15);
  });
});
