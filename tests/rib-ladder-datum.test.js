// tests/rib-ladder-datum.test.js
import { describe, it, expect } from 'vitest';
import { renderRibLadderSVG } from '../src/render/svg.js';
import { buildStraightPattern } from '../src/geometry/straight.js';
import { computeMetrics } from '../src/geometry/metrics.js';
import { LAYER } from '../src/constants.js';
import { normalizeParams, DEFAULT_PARAMS } from '../src/params.js';

function ladder(overrides = {}) {
  const params = normalizeParams({ ...DEFAULT_PARAMS, ...overrides });
  const model = { metrics: computeMetrics(params) };
  return { svg: renderRibLadderSVG(model, params), params };
}

describe('rib-ladder shared datum', () => {
  it('declares the fabric endMargin as the rib-stack y-origin on the root svg', () => {
    const { svg, params } = ladder({ frontW: 160, frontH: 115 });
    const m = /<svg[^>]*\sdata-datum="([\d.]+)"/.exec(svg);
    expect(m).not.toBeNull();
    expect(parseFloat(m[1])).toBeCloseTo(params.endMargin, 6);
  });

  it('ladder datum equals the fabric footprint datum so they overlay 1:1', () => {
    const params = normalizeParams({ ...DEFAULT_PARAMS, frontW: 160, frontH: 115 });
    const model = { metrics: computeMetrics(params) };
    const svg = renderRibLadderSVG(model, params);
    const fabric = buildStraightPattern(params);
    const engraveYs = fabric.segments
      .filter((s) => s.type === LAYER.ENGRAVE)
      .flatMap((s) => s.points.map((p) => p.y));
    const fabricDatum = Math.min(...engraveYs);
    const m = /data-datum="([\d.]+)"/.exec(svg);
    expect(parseFloat(m[1])).toBeCloseTo(fabricDatum, 6);
  });
});
