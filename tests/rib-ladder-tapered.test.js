// tests/rib-ladder-tapered.test.js
import { describe, it, expect } from 'vitest';
import { renderRibLadderSVG } from '../src/render/svg.js';
import { computeMetrics } from '../src/geometry/metrics.js';
import { normalizeParams, DEFAULT_PARAMS } from '../src/params.js';

function ladder(overrides = {}) {
  const params = normalizeParams({ ...DEFAULT_PARAMS, cornerMode: 'clear', ...overrides });
  const model = { metrics: computeMetrics(params) };
  return { svg: renderRibLadderSVG(model, params), params };
}

function firstLadderD(svg) {
  const m = svg.match(/<path data-role="ladder"[^>]*\bd="([^"]*)"/);
  return m[1];
}
function xCoords(d) {
  const nums = d.match(/-?[\d.]+/g).map(Number);
  return nums.filter((_, i) => i % 2 === 0);
}

describe('renderRibLadderSVG — tapered per-pleat trapezoids (P3)', () => {
  it('uses the REAR (wider) width, not front-only', () => {
    const { svg, params } = ladder({
      type: 'tapered',
      frontW: 100, rearW: 200, frontH: 100, rearH: 200,
    });
    const ca = params.cornerAllowance;
    const d = firstLadderD(svg);
    const xs = xCoords(d);
    const span = Math.max(...xs) - Math.min(...xs);
    // widest pleat = rear: 200 - 2*ca; front-only bug would give 100 - 2*ca
    expect(span).toBeCloseTo(200 - 2 * ca + params.kerf, 4);
  });

  it('tapers: some ribs are much narrower than the widest (trapezoid, not rectangle)', () => {
    const { svg, params } = ladder({
      type: 'tapered',
      frontW: 100, rearW: 200, frontH: 100, rearH: 200,
    });
    const colX0 = 5 + params.kerf / 2;
    const xs = xCoords(firstLadderD(svg));
    const rightXs = xs.filter((x) => x > colX0 + 40); // rib right edges + notch inners
    // a front-region rib right edge sits far left of the rear one -> taper present
    expect(Math.min(...rightXs)).toBeLessThan(colX0 + 100);
    expect(Math.max(...rightXs)).toBeGreaterThan(colX0 + 160);
  });
});
