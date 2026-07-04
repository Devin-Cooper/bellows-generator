// tests/rib-ladder-calibration.test.js
import { describe, it, expect } from 'vitest';
import { renderRibLadderSVG } from '../src/render/svg.js';
import { computeMetrics } from '../src/geometry/metrics.js';
import { normalizeParams, DEFAULT_PARAMS } from '../src/params.js';

function ladder(overrides = {}) {
  const params = normalizeParams({ ...DEFAULT_PARAMS, ...overrides });
  const model = { metrics: computeMetrics(params) };
  return { svg: renderRibLadderSVG(model, params), params };
}

function parseRects(svg) {
  const out = [];
  const re = /<rect\s([^>]*?)\/?>/g;
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

describe('rib-ladder calibration square', () => {
  it('emits exactly one 1:1 calibration square of 50 mm side', () => {
    const { svg } = ladder({ frontW: 160, frontH: 115 });
    const cal = parseRects(svg).filter((r) => r['data-role'] === 'calibration');
    expect(cal.length).toBe(1);
    expect(parseFloat(cal[0].width)).toBeCloseTo(50, 6);
    expect(parseFloat(cal[0].height)).toBeCloseTo(50, 6);
  });

  it('labels the calibration square and fits it inside the sheet', () => {
    const { svg } = ladder({ frontW: 160, frontH: 115 });
    expect(/data-role="calibration-label"[^>]*>50 mm<\/text>/.test(svg)).toBe(true);
    const cal = parseRects(svg).find((r) => r['data-role'] === 'calibration');
    const sheetH = parseFloat(/height="([\d.]+)mm"/.exec(svg)[1]);
    expect(parseFloat(cal.y) + parseFloat(cal.height)).toBeLessThanOrEqual(sheetH + 1e-6);
  });
});
