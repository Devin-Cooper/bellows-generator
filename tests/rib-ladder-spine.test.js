import { describe, it, expect } from 'vitest';
import { renderRibLadderSVG } from '../src/render/svg.js';
import { computeMetrics } from '../src/geometry/metrics.js';
import { normalizeParams, DEFAULT_PARAMS } from '../src/params.js';

function ladder(overrides = {}) {
  const params = normalizeParams({ ...DEFAULT_PARAMS, ...overrides });
  const model = { metrics: computeMetrics(params) };
  return { svg: renderRibLadderSVG(model, params), params, metrics: model.metrics };
}

function parse(svg, tag) {
  const out = [];
  const re = new RegExp(`<${tag}\\s([^>]*?)/?>`, 'g');
  let m;
  while ((m = re.exec(svg)) !== null) {
    const attrs = {};
    const are = /([\w-]+)="([^"]*)"/g;
    let a;
    while ((a = are.exec(m[1])) !== null) attrs[a[1]] = a[2];
    out.push(attrs);
  }
  return out;
}

describe('rib-ladder spine score', () => {
  it('emits one centre/spine score line per column (W + H)', () => {
    const { svg } = ladder({ frontW: 160, frontH: 115 });
    const spines = parse(svg, 'line').filter((l) => l['data-role'] === 'spine');
    expect(spines.length).toBe(2);
    expect(new Set(spines.map((s) => s['data-face']))).toEqual(new Set(['W', 'H']));
  });

  it('collapses to one spine for a square cross-section', () => {
    const { svg } = ladder({ frontW: 150, frontH: 150 });
    const spines = parse(svg, 'line').filter((l) => l['data-role'] === 'spine');
    expect(spines.length).toBe(1);
  });

  it('runs the spine from the datum down the full rib stack', () => {
    const { svg, params, metrics } = ladder({ frontW: 160, frontH: 115 });
    const spines = parse(svg, 'line').filter((l) => l['data-role'] === 'spine');
    const stackH = (metrics.ribCount - 1) * metrics.pitch + params.rib;
    for (const s of spines) {
      expect(parseFloat(s.y1)).toBeCloseTo(params.endMargin, 6);
      expect(parseFloat(s.y2)).toBeCloseTo(params.endMargin + stackH, 6);
      expect(parseFloat(s.x1)).toBeCloseTo(parseFloat(s.x2), 6); // vertical
    }
  });
});
