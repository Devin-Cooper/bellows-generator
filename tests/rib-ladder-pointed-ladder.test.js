// tests/rib-ladder-pointed-ladder.test.js
// Pointed/alternating ribs carry a 45deg apex at BOTH corner ends. The laser rib-ladder
// outline (traceColumn) must trace the LEFT apex as well as the RIGHT so the cut ribs
// register with their own fabric ENGRAVE footprint and the 3D STL — otherwise ribs are
// pointed on the right and square on the left. Clear mode has no apex and must be
// byte-for-byte unaffected.
import { describe, it, expect } from 'vitest';
import { renderRibLadderSVG } from '../src/render/svg.js';
import { computeMetrics } from '../src/geometry/metrics.js';
import { normalizeParams, DEFAULT_PARAMS } from '../src/params.js';
import { cornerPointReach } from '../src/geometry/ribShapes.js';

function ladder(overrides = {}) {
  const params = normalizeParams({ ...DEFAULT_PARAMS, frontW: 160, frontH: 115, ...overrides });
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

// notch subpaths (everything after the first Z), each trimmed.
function notchSubs(d) {
  return d.split('Z').map((s) => s.trim()).filter((s) => s.length).slice(1);
}

describe('renderRibLadderSVG — pointed ribs are pointed at BOTH ends', () => {
  it('(a) traces the LEFT apex: outer minX is < colX0 by ~reach (not square at colX0)', () => {
    const clr = ladder({ cornerMode: 'clear' });
    const pt = ladder({ cornerMode: 'pointed' });
    const bC = outerBBox(ladderPaths(clr.svg, 'W')[0].d);
    const bP = outerBBox(ladderPaths(pt.svg, 'W')[0].d);
    // colX0 = the un-apexed left rail = clear-mode outer left edge + kerf/2 (grown outward).
    const half = pt.params.kerf / 2;
    const colX0 = bC.minX + half;
    const reach = cornerPointReach(pt.params.rib, pt.params.cornerAllowance);
    expect(reach).toBeGreaterThan(0);
    // Left apex present: outer pushes past colX0 to the LEFT by ~reach (not still at colX0).
    expect(bP.minX).toBeLessThan(colX0 - reach + half + 1e-6);
    expect(colX0 - bP.minX).toBeCloseTo(reach + half, 4);
  });

  it('(b) SYMMETRY: left protrusion depth ~= right protrusion depth (both ends equally pointed)', () => {
    const clr = ladder({ cornerMode: 'clear' });
    const pt = ladder({ cornerMode: 'pointed' });
    const bC = outerBBox(ladderPaths(clr.svg, 'W')[0].d);
    const bP = outerBBox(ladderPaths(pt.svg, 'W')[0].d);
    const half = pt.params.kerf / 2;
    // Rail x-positions are cornerMode-independent (apex only reshapes rib ends), so recover
    // the nominal left/right rails from the clear-mode bbox.
    const colX0 = bC.minX + half;               // left rail (grown outward by kerf/2)
    const colXR = bC.maxX - half;               // right rail (grown outward by kerf/2)
    const leftProtrusion = colX0 - bP.minX;     // how far the LEFT apex pokes out
    const rightProtrusion = bP.maxX - colXR;    // how far the RIGHT apex pokes out
    expect(leftProtrusion).toBeCloseTo(rightProtrusion, 4); // within far tighter than kerf
    expect(rightProtrusion).toBeGreaterThan(half);          // right end is genuinely pointed
  });

  it('(c) CONNECTIVITY: still ONE connected path; notch loop + connector tabs unchanged', () => {
    const clr = ladder({ cornerMode: 'clear' });
    const pt = ladder({ cornerMode: 'pointed' });
    // one path per family, both modes
    expect(ladderPaths(pt.svg, 'W').length).toBe(1);
    expect(ladderPaths(pt.svg, 'H').length).toBe(1);
    const dC = ladderPaths(clr.svg, 'W')[0].d;
    const dP = ladderPaths(pt.svg, 'W')[0].d;
    // subpath count unchanged: outer + (ribCount-1) middle notches = ribCount M commands
    expect((dP.match(/M /g) || []).length).toBe(pt.metrics.ribCount);
    expect((dP.match(/M /g) || []).length).toBe((dC.match(/M /g) || []).length);
    // the notch loop (and thus tabW) is untouched — notch subpaths are byte-identical to clear
    expect(notchSubs(dP)).toEqual(notchSubs(dC));
    // connector-tab near colX0 survives at tabW + kerf (measured from the un-apexed rail)
    const tabW = Math.max(1, Math.min(2, pt.params.cornerAllowance));
    const bC = outerBBox(dC);
    const notchXs = notchSubs(dP)[0].match(/-?[\d.]+/g).map(Number).filter((_, i) => i % 2 === 0);
    expect(Math.min(...notchXs) - bC.minX).toBeCloseTo(tabW + pt.params.kerf, 4);
  });

  it('clear mode is unaffected: no left apex, outer left edge stays a straight rail', () => {
    const clr = ladder({ cornerMode: 'clear' });
    const bC = outerBBox(ladderPaths(clr.svg, 'W')[0].d);
    const half = clr.params.kerf / 2;
    // left edge is exactly the grown rail (colX0 - kerf/2); no outward jog.
    expect(bC.minX).toBeCloseTo(5 + clr.params.kerf / 2 - half, 6); // margin(5) + kerf/2 rail, grown out by half
  });
});
