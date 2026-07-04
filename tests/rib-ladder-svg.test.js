// tests/rib-ladder-svg.test.js
import { describe, it, expect } from 'vitest';
import { renderRibLadderSVG } from '../src/render/svg.js';
import { computeMetrics } from '../src/geometry/metrics.js';
import { normalizeParams, DEFAULT_PARAMS } from '../src/params.js';

function ladder(overrides = {}) {
  const params = normalizeParams({ ...DEFAULT_PARAMS, cornerMode: 'clear', ...overrides });
  const model = { metrics: computeMetrics(params) };
  return { svg: renderRibLadderSVG(model, params), params, metrics: model.metrics };
}

// All <path data-role="ladder"> attribute maps, optionally filtered by face.
function ladderPaths(svg, face) {
  const out = [];
  const re = /<path ([^>]*?)\/>/g;
  let m;
  while ((m = re.exec(svg)) !== null) {
    const attrs = {};
    const are = /([\w-]+)="([^"]*)"/g;
    let a;
    while ((a = are.exec(m[1])) !== null) attrs[a[1]] = a[2];
    if (attrs['data-role'] === 'ladder' && (!face || attrs['data-face'] === face)) out.push(attrs);
  }
  return out;
}

// bbox of the OUTER subpath (everything before the first Z) of a d-string.
function outerBBox(d) {
  const first = d.split('Z')[0];
  const nums = first.match(/-?[\d.]+/g).map(Number);
  const xs = [];
  const ys = [];
  for (let i = 0; i < nums.length; i += 2) { xs.push(nums[i]); ys.push(nums[i + 1]); }
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

describe('renderRibLadderSVG — connected outline (P0)', () => {
  it('cuts each column as ONE connected path, not loose rects', () => {
    const { svg, metrics, params } = ladder({ frontW: 160, frontH: 115 });
    expect(svg.includes('data-role="rib"')).toBe(false); // no confetti rib rects
    expect(svg.includes('data-role="tab"')).toBe(false);  // no confetti tab rects
    expect(ladderPaths(svg, 'W').length).toBe(1);
    expect(ladderPaths(svg, 'H').length).toBe(1);
    // outer boundary + (ribCount-1) middle notches = ribCount subpaths in the single path
    const dW = ladderPaths(svg, 'W')[0].d;
    expect((dW.match(/M /g) || []).length).toBe(metrics.ribCount);
    // the notches leave connector tabs: each notch is narrower than the rib band
    const subs = dW.split('Z').filter((s) => s.trim().length);
    const bb = outerBBox(dW);
    const outerW = bb.maxX - bb.minX;
    const notch = subs[1].match(/-?[\d.]+/g).map(Number);
    const notchXs = notch.filter((_, i) => i % 2 === 0);
    const notchW = Math.max(...notchXs) - Math.min(...notchXs);
    expect(notchW).toBeLessThan(outerW); // tabs remain on both ends
    // pin the connector-tab width exactly: each rail must survive at tabW + kerf
    const tabW = Math.min(2, params.cornerAllowance);
    expect(Math.min(...notchXs) - bb.minX).toBeCloseTo(tabW + params.kerf, 4);  // left tab
    expect(bb.maxX - Math.max(...notchXs)).toBeCloseTo(tabW + params.kerf, 4);  // right tab
  });

  it('emits BOTH W and H rib families (P5)', () => {
    const { svg } = ladder({ frontW: 160, frontH: 115 });
    expect(ladderPaths(svg, 'W').length).toBe(1);
    expect(ladderPaths(svg, 'H').length).toBe(1);
  });

  it('grows the outline OUTWARD by kerf so parts cut to nominal width', () => {
    const { svg, params } = ladder({ frontW: 160, frontH: 115 });
    const ca = params.cornerAllowance;
    const bW = outerBBox(ladderPaths(svg, 'W')[0].d);
    const bH = outerBBox(ladderPaths(svg, 'H')[0].d);
    expect(bW.maxX - bW.minX).toBeCloseTo(160 - 2 * ca + params.kerf, 4);
    expect(bH.maxX - bH.minX).toBeCloseTo(115 - 2 * ca + params.kerf, 4);
  });

  it('spans ribCount pitches along the draw (self-aligns with fold lines)', () => {
    const { svg, params, metrics } = ladder({ frontW: 160, frontH: 115 });
    const b = outerBBox(ladderPaths(svg, 'W')[0].d);
    const expected = (metrics.ribCount - 1) * metrics.pitch + params.rib + params.kerf;
    expect(b.maxY - b.minY).toBeCloseTo(expected, 4);
  });

  it('is a valid <svg> with mm dimensions', () => {
    const { svg } = ladder({ frontW: 160, frontH: 115 });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(/width="[\d.]+mm"/.test(svg)).toBe(true);
  });

  it('floors connector tabs to >=1mm so lattice never severs at cornerAllowance=0', () => {
    const { svg, params } = ladder({ frontW: 160, frontH: 115, cornerAllowance: 0 });
    const dW = ladderPaths(svg, 'W')[0].d;
    const bb = outerBBox(dW);
    const subs = dW.split('Z').filter((s) => s.trim().length);
    const notch = subs[1].match(/-?[\d.]+/g).map(Number);
    const notchXs = notch.filter((_, i) => i % 2 === 0);
    // floor(max(1, min(2, 0))) = 1, so each rail must be 1 + kerf
    expect(Math.min(...notchXs) - bb.minX).toBeCloseTo(1 + params.kerf, 4);  // left tab floored
    expect(bb.maxX - Math.max(...notchXs)).toBeCloseTo(1 + params.kerf, 4);  // right tab floored
  });
});
