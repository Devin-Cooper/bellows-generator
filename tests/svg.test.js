import { describe, it, expect } from 'vitest';
import { renderPatternSVG } from '../src/render/svg.js';
import { LAYER_COLORS } from '../src/constants.js';

/** Minimal hand-built PatternModel so the renderer test does not depend on the geometry engine. */
function fixtureModel() {
  return {
    segments: [
      {
        type: 'CUT',
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 20 },
          { x: 0, y: 20 },
        ],
        closed: true,
        layer: 'CUT',
      },
      {
        type: 'FOLD_MOUNTAIN',
        points: [
          { x: 5, y: 0 },
          { x: 5, y: 20 },
        ],
        closed: false,
        layer: 'FOLD_MOUNTAIN',
      },
    ],
    regions: [],
    seamFaceIndex: 0,
    bounds: { w: 10, h: 20 },
    metrics: {},
  };
}

const params = { kerf: 0.15, pageSize: 'A4' };

describe('renderPatternSVG', () => {
  it('sizes the root svg in mm with a matching mm viewBox', () => {
    const svg = renderPatternSVG(fixtureModel(), params);
    expect(svg).toMatch(/width="10mm"/);
    expect(svg).toMatch(/height="20mm"/);
    expect(svg).toMatch(/viewBox="0 0 10 20"/);
  });

  it('emits one inkscape layer group per segment type with the pinned stroke color', () => {
    const svg = renderPatternSVG(fixtureModel(), params);
    expect(svg).toContain(
      `<g inkscape:groupmode="layer" inkscape:label="CUT" stroke="${LAYER_COLORS.CUT}" fill="none">`
    );
    expect(svg).toContain(
      `<g inkscape:groupmode="layer" inkscape:label="FOLD_MOUNTAIN" stroke="${LAYER_COLORS.FOLD_MOUNTAIN}" fill="none">`
    );
  });

  it('grows CUT rectangles outward by kerf/2 but never offsets fold lines', () => {
    const svg = renderPatternSVG(fixtureModel(), params);
    // kerf/2 = 0.075: corners move outward from the rect centre.
    expect(svg).toContain('M -0.075 -0.075 L 10.075 -0.075 L 10.075 20.075 L -0.075 20.075 Z');
    // fold line is untouched.
    expect(svg).toContain('M 5 0 L 5 20');
  });
});
