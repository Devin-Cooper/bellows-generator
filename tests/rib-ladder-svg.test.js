// tests/rib-ladder-svg.test.js
import { describe, it, expect } from 'vitest';
import { renderRibLadderSVG } from '../src/render/svg.js';
import { computeMetrics } from '../src/geometry/metrics.js';
import { normalizeParams, DEFAULT_PARAMS } from '../src/params.js';

function ladder(overrides = {}) {
  const params = normalizeParams({ ...DEFAULT_PARAMS, ...overrides });
  const model = { metrics: computeMetrics(params) };
  return { svg: renderRibLadderSVG(model, params), params, metrics: model.metrics };
}

function parseRects(svg) {
  const out = [];
  const re = /<rect ([^>]*?)\/>/g;
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

describe('renderRibLadderSVG', () => {
  it('emits one rib per position per unique face width', () => {
    const { svg, metrics } = ladder({ frontW: 160, frontH: 115 });
    const rects = parseRects(svg);
    const ribsW = rects.filter((r) => r['data-role'] === 'rib' && r['data-face'] === 'W');
    const ribsH = rects.filter((r) => r['data-role'] === 'rib' && r['data-face'] === 'H');
    expect(ribsW.length).toBe(metrics.ribCount);
    expect(ribsH.length).toBe(metrics.ribCount);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(/width="[\d.]+mm"/.test(svg)).toBe(true);
  });

  it('kerf-compensates rib width to faceDim - 2*cornerAllowance + kerf', () => {
    const { svg, params } = ladder({ frontW: 160, frontH: 115 });
    const rects = parseRects(svg);
    const ribW = rects.find((r) => r['data-role'] === 'rib' && r['data-face'] === 'W');
    const ribH = rects.find((r) => r['data-role'] === 'rib' && r['data-face'] === 'H');
    const ca = params.cornerAllowance;
    const kerf = params.kerf;
    expect(parseFloat(ribW.width)).toBeCloseTo(160 - 2 * ca + kerf, 6);
    expect(parseFloat(ribH.width)).toBeCloseTo(115 - 2 * ca + kerf, 6);
  });

  it('steps ribs by the engine pitch so they self-align with fold lines', () => {
    const { svg, metrics } = ladder({ frontW: 160, frontH: 115 });
    const rects = parseRects(svg);
    const ribsW = rects.filter((r) => r['data-role'] === 'rib' && r['data-face'] === 'W');
    const y0 = parseFloat(ribsW[0].y);
    const y1 = parseFloat(ribsW[1].y);
    expect(y1 - y0).toBeCloseTo(metrics.pitch, 6);
  });

  it('places two <=2mm connector tabs per gap in the corner clear zone', () => {
    const { svg, params, metrics } = ladder({ frontW: 160, frontH: 115 });
    const rects = parseRects(svg);
    const ca = params.cornerAllowance;

    const tabs = rects.filter((r) => r['data-role'] === 'tab');
    // two faces x two tabs per gap x (ribCount-1) gaps
    expect(tabs.length).toBe(2 * 2 * (metrics.ribCount - 1));
    for (const t of tabs) expect(parseFloat(t.width)).toBeLessThanOrEqual(2);

    const tabsW = tabs.filter((t) => t['data-face'] === 'W');
    expect(tabsW.length).toBe(2 * (metrics.ribCount - 1));

    const ribW = rects.find((r) => r['data-role'] === 'rib' && r['data-face'] === 'W');
    const ribLeft = parseFloat(ribW.x);
    const ribRight = ribLeft + parseFloat(ribW.width);

    for (const t of tabsW.filter((t) => t['data-side'] === 'left')) {
      const x = parseFloat(t.x);
      expect(x).toBeGreaterThanOrEqual(ribLeft - 1e-6);
      expect(x - ribLeft).toBeLessThan(ca); // within the per-side corner clear zone
    }
    for (const t of tabsW.filter((t) => t['data-side'] === 'right')) {
      const x = parseFloat(t.x);
      const right = x + parseFloat(t.width);
      expect(right).toBeLessThanOrEqual(ribRight + 1e-6);
      expect(ribRight - right).toBeLessThan(ca);
    }
  });
});
