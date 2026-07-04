// tests/rib-ladder-labels.test.js
import { describe, it, expect } from 'vitest';
import { renderRibLadderSVG } from '../src/render/svg.js';
import { computeMetrics } from '../src/geometry/metrics.js';
import { normalizeParams, DEFAULT_PARAMS } from '../src/params.js';

function ladder(overrides = {}) {
  const params = normalizeParams({ ...DEFAULT_PARAMS, ...overrides });
  const model = { metrics: computeMetrics(params) };
  return { svg: renderRibLadderSVG(model, params), params, metrics: model.metrics };
}

function parseText(svg) {
  const out = [];
  const re = /<text\s([^>]*?)>([^<]*)<\/text>/g;
  let m;
  while ((m = re.exec(svg)) !== null) {
    const attrs = {};
    const are = /([\w-]+)="([^"]*)"/g;
    let a;
    while ((a = are.exec(m[1])) !== null) attrs[a[1]] = a[2];
    attrs._text = m[2];
    out.push(attrs);
  }
  return out;
}

describe('rib-ladder per-rib labels', () => {
  it('emits one ENGRAVE label per rib per column with index + face + corner-share', () => {
    const { svg, metrics } = ladder({ frontW: 160, frontH: 115 });
    const labels = parseText(svg).filter((t) => t['data-role'] === 'rib-label');
    expect(labels.length).toBe(2 * metrics.ribCount); // W + H columns
    expect(new Set(labels.map((l) => l['data-face']))).toEqual(new Set(['W', 'H']));
    for (const l of labels) {
      expect(l['data-index']).toBeDefined();
      expect(l['data-corner']).toMatch(/^L.*\/R.*/);
      expect(l._text).toContain(l['data-index']);
      expect(l._text).toContain(l['data-face']);
    }
  });

  it('indexes labels 0..ribCount-1 within each column', () => {
    const { svg, metrics } = ladder({ frontW: 160, frontH: 115 });
    const labels = parseText(svg).filter((t) => t['data-role'] === 'rib-label');
    const wIdx = labels
      .filter((l) => l['data-face'] === 'W')
      .map((l) => Number(l['data-index']))
      .sort((a, b) => a - b);
    expect(wIdx[0]).toBe(0);
    expect(wIdx[wIdx.length - 1]).toBe(metrics.ribCount - 1);
  });
});
