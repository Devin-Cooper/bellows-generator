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
  it('cuts each column as ONE connected path with inset connector tabs, not loose rects', () => {
    const { svg, metrics, params } = ladder({ frontW: 160, frontH: 115 });
    expect(svg.includes('data-role="rib"')).toBe(false); // no confetti rib rects
    expect(svg.includes('data-role="tab"')).toBe(false);  // no confetti tab rects
    expect(ladderPaths(svg, 'W').length).toBe(2);
    expect(ladderPaths(svg, 'H').length).toBe(2);
    // MIGRATED (inset tabs): each gap is now cut into 3 notches straddling the 2 inset tabs, so the
    // single path holds outer boundary + 3*(ribCount-1) notch subpaths (was ribCount before).
    const dW = ladderPaths(svg, 'W')[0].d;
    expect((dW.match(/M /g) || []).length).toBe(1 + 3 * (metrics.ribCount - 1));
    const bb = outerBBox(dW);
    const outerW = bb.maxX - bb.minX;
    const half = params.kerf / 2;
    const ca = params.cornerAllowance;               // 15
    const tabW = Math.min(2, ca);                    // 2 — the OLD edge-rail width
    const leftClear = bb.minX + half;                // kerf-grown rect -> clear edge is inset kerf/2
    const rightClear = bb.maxX - half;
    // gap 0 -> subs[1..3] = left / middle / right cut notches; the tabs sit in the gaps between them
    const subX = (s) => {
      const xs = s.match(/-?[\d.]+/g).map(Number).filter((_, i) => i % 2 === 0);
      return [Math.min(...xs), Math.max(...xs)];
    };
    const subs = dW.split('Z').map((s) => s.trim()).filter(Boolean);
    const n1 = subX(subs[1]), n2 = subX(subs[2]), n3 = subX(subs[3]);
    expect(n2[1] - n2[0]).toBeLessThan(outerW);      // each notch narrower than the band -> tabs remain
    const tabL = (n1[1] + n2[0]) / 2;                // between left & middle cuts
    const tabR = (n2[1] + n3[0]) / 2;                // between middle & right cuts
    // tabs are INSET by cornerAllowance (match bridgeTabXs), NOT the old ~tabW rails at the edges
    expect(tabL).toBeCloseTo(leftClear + ca, 3);
    expect(tabR).toBeCloseTo(rightClear - ca, 3);
    expect(tabL).not.toBeCloseTo(leftClear + tabW, 1);
    expect(tabR).not.toBeCloseTo(rightClear - tabW, 1);
    // ends fully cut: the outermost notches reach the clear edges (only a ~kerf/2 sliver remains)
    expect(n1[0] - leftClear).toBeLessThan(0.2 + half);
    expect(rightClear - n3[1]).toBeLessThan(0.2 + half);
  });

  it('emits BOTH W and H rib families (P5)', () => {
    const { svg } = ladder({ frontW: 160, frontH: 115 });
    expect(ladderPaths(svg, 'W').length).toBe(2);
    expect(ladderPaths(svg, 'H').length).toBe(2);
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
    // MIGRATED (inset tabs): at ca=0 bridgeTabXs puts the two tabs AT the clear edges, so each gap is
    // one central cut notch that leaves a ~tabW/2 (0.5mm, the floored 1mm split two ways) rail at each
    // end. tabW = max(1, min(2, 0)) = 1, so each edge rail is tabW/2 + kerf and the lattice never severs.
    const tabW = Math.max(1, Math.min(2, params.cornerAllowance)); // = 1
    expect(Math.min(...notchXs) - bb.minX).toBeCloseTo(tabW / 2 + params.kerf, 4);  // left edge tab
    expect(bb.maxX - Math.max(...notchXs)).toBeCloseTo(tabW / 2 + params.kerf, 4);  // right edge tab
    expect(Math.min(...notchXs)).toBeGreaterThan(bb.minX + 1e-6);   // material remains at the left end
    expect(bb.maxX).toBeGreaterThan(Math.max(...notchXs) + 1e-6);   // ...and the right end
  });
});
