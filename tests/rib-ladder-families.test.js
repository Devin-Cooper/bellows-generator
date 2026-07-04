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

  it('annotates every rectangular column with a cut x2 note; total ribs = 4 (P5)', () => {
    const svg = ladder({ frontW: 160, frontH: 115 });
    const paths = ladderPaths(svg);
    const notes = (svg.match(/data-role="qty"/g) || []).length;
    expect(notes).toBe(2); // one per column
    expect(svg.includes('cut x2')).toBe(true);
    for (const a of paths) expect(a.includes('data-qty="2"')).toBe(true);
    // two columns x2 walls each = the 4-wall ring
    const totalQty = paths.reduce((n, a) => n + Number(a.match(/data-qty="(\d+)"/)[1]), 0);
    expect(totalQty).toBe(4);
  });

  it('the merged square column specifies all 4 walls (cut x4, one strip family)', () => {
    const svg = ladder({ frontW: 150, frontH: 150 });
    expect((svg.match(/data-role="qty"/g) || []).length).toBe(1);
    expect(svg.includes('cut x4')).toBe(true);
    expect(svg.includes('cut x2')).toBe(false);
    const paths = ladderPaths(svg);
    expect(paths.length).toBe(1);
    expect(paths[0].includes('data-qty="4"')).toBe(true);
    // a square tube is a 4-wall ring => 4 rib strips specified in total
    const totalQty = paths.reduce((n, a) => n + Number(a.match(/data-qty="(\d+)"/)[1]), 0);
    expect(totalQty).toBe(4);
  });
});
