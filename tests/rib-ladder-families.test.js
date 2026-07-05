// tests/rib-ladder-families.test.js
import { describe, it, expect } from 'vitest';
import { renderRibLadderSVG } from '../src/render/svg.js';
import { computeMetrics } from '../src/geometry/metrics.js';
import { normalizeParams, DEFAULT_PARAMS } from '../src/params.js';

function ladder(overrides = {}) {
  const params = normalizeParams({ ...DEFAULT_PARAMS, cornerMode: 'clear', ...overrides });
  const model = { metrics: computeMetrics(params) };
  return renderRibLadderSVG(model, params);
}
function ladderPaths(svg) {
  const out = [];
  const re = /<path ([^>]*?)\/>/g;
  let m;
  while ((m = re.exec(svg)) !== null) {
    const attrs = {};
    const are = /([\w-]+)="([^"]*)"/g;
    let a;
    while ((a = are.exec(m[1])) !== null) attrs[a[1]] = a[2];
    if (attrs['data-role'] === 'ladder') out.push(attrs);
  }
  return out;
}

describe('renderRibLadderSVG — 4 whole walls, UNCOMBINED (dedupe + cut-xN retired)', () => {
  it('a square bellows emits all 4 walls (2 W + 2 H), never one merged column', () => {
    const paths = ladderPaths(ladder({ frontW: 150, frontH: 150 }));
    expect(paths.length).toBe(4);
    expect(new Set(paths.map((a) => `${a['data-face']}${a['data-wall']}`)))
      .toEqual(new Set(['W0', 'W2', 'H1', 'H3']));
  });

  it('a rectangular bellows also emits all 4 walls', () => {
    const paths = ladderPaths(ladder({ frontW: 160, frontH: 115 }));
    expect(paths.length).toBe(4);
    expect(paths.map((a) => a['data-face']).sort()).toEqual(['H', 'H', 'W', 'W']);
  });

  it('carries no "cut xN" note and no data-qty multiplier', () => {
    for (const dims of [{ frontW: 150, frontH: 150 }, { frontW: 160, frontH: 115 }]) {
      const svg = ladder(dims);
      expect(/cut x\d/.test(svg)).toBe(false);
      expect(svg.includes('data-qty')).toBe(false);
      expect(svg.includes('data-role="qty"')).toBe(false);
    }
  });
});
