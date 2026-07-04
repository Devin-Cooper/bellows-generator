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
    if (/data-role="ladder"/.test(m[1])) out.push(m[1]);
  }
  return out;
}

describe('renderRibLadderSVG — families & dedupe', () => {
  it('collapses a square bellows to ONE column (P4)', () => {
    const svg = ladder({ frontW: 150, frontH: 150 }); // default square
    expect(ladderPaths(svg).length).toBe(1);
  });

  it('keeps two columns for a rectangular bellows', () => {
    const svg = ladder({ frontW: 160, frontH: 115 });
    const faces = ladderPaths(svg).map((a) => a.match(/data-face="([^"]*)"/)[1]);
    expect(faces.sort()).toEqual(['H', 'W']);
  });

  it('annotates every column with a cut x2 quantity note (P5)', () => {
    const svg = ladder({ frontW: 160, frontH: 115 });
    const notes = (svg.match(/data-role="qty"/g) || []).length;
    expect(notes).toBe(2); // one per column
    expect(svg.includes('cut x2')).toBe(true);
    for (const a of ladderPaths(svg)) expect(a.includes('data-qty="2"')).toBe(true);
  });

  it('the square column still carries the x2 note', () => {
    const svg = ladder({ frontW: 150, frontH: 150 });
    expect((svg.match(/data-role="qty"/g) || []).length).toBe(1);
    expect(svg.includes('cut x2')).toBe(true);
  });
});
