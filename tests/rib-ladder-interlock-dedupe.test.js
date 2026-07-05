// tests/rib-ladder-interlock-dedupe.test.js
// Square-dedupe must be SHAPE-aware in interlock. A square bellows has W and H columns of
// EQUAL width but COMPLEMENTARY shape (W wide at even ribIndex, H wide at odd), so merging on
// width alone would emit 4 identical WIDE strips instead of 2 wide + 2 narrow and the ring could
// never interlock (and it would disagree with the STL, which keeps the families separate). In
// interlock a square must keep TWO columns (2xW + 2xH). In clear mode a square is still one
// merged plain column (qty 4); rectangular is unchanged in both modes.
import { describe, it, expect } from 'vitest';
import { renderRibLadderSVG } from '../src/render/svg.js';
import { computeMetrics } from '../src/geometry/metrics.js';
import { normalizeParams, DEFAULT_PARAMS } from '../src/params.js';

function ladder(overrides = {}) {
  const params = normalizeParams({ ...DEFAULT_PARAMS, ...overrides });
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
const faceOf = (a) => a.match(/data-face="([^"]*)"/)[1];
const qtyOf = (a) => Number(a.match(/data-qty="(\d+)"/)[1]);
const dOf = (a) => a.match(/\bd="([^"]*)"/)[1];

describe('renderRibLadderSVG — shape-aware square dedupe (interlock)', () => {
  it('interlock square keeps TWO complementary columns (2xW + 2xH), not one merged wide strip', () => {
    const svg = ladder({ frontW: 150, frontH: 150, cornerMode: 'interlock' });
    const paths = ladderPaths(svg);
    expect(paths.length).toBe(2);
    expect(paths.map(faceOf).sort()).toEqual(['H', 'W']);
    for (const a of paths) expect(qtyOf(a)).toBe(2);            // each column stands for 2 walls
    const totalQty = paths.reduce((n, a) => n + qtyOf(a), 0);
    expect(totalQty).toBe(4);                                  // the full 4-wall ring
    expect(svg.includes('cut x4')).toBe(false);                // NOT the merged square note
    // the two columns are genuinely different shapes: their cut d-strings differ.
    expect(dOf(paths[0])).not.toBe(dOf(paths[1]));
  });

  it('clear square still collapses to ONE merged plain column (qty 4)', () => {
    const svg = ladder({ frontW: 150, frontH: 150, cornerMode: 'clear' });
    const paths = ladderPaths(svg);
    expect(paths.length).toBe(1);
    expect(qtyOf(paths[0])).toBe(4);
    expect(svg.includes('cut x4')).toBe(true);
    expect(svg.includes('cut x2')).toBe(false);
  });

  it('rectangular is unchanged in both modes: two columns W + H, qty 2 each', () => {
    for (const cornerMode of ['clear', 'interlock']) {
      const svg = ladder({ frontW: 160, frontH: 115, cornerMode });
      const paths = ladderPaths(svg);
      expect(paths.length).toBe(2);
      expect(paths.map(faceOf).sort()).toEqual(['H', 'W']);
      for (const a of paths) expect(qtyOf(a)).toBe(2);
    }
  });
});
