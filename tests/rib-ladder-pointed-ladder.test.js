// tests/rib-ladder-pointed-ladder.test.js
// MIGRATED (interlock rework): pointed/alternating are removed; cornerMode is {clear|interlock}.
// In interlock the rib-ladder trace must dent EACH rail INWARD at a narrow rib's notch
// (a vertex with 0 < x < width) and OUTWARD at a wide rib's point — otherwise narrow ribs
// cut as plain rectangles and nothing nests. Clear mode keeps straight rails. The trace
// stays ONE connected path with its connector-tab notches (M count === ribCount).
import { describe, it, expect } from 'vitest';
import { renderRibLadderSVG } from '../src/render/svg.js';
import { computeMetrics } from '../src/geometry/metrics.js';
import { normalizeParams, DEFAULT_PARAMS } from '../src/params.js';

// non-square (160x115) so W and H columns keep distinct widths and are NOT merged by the
// (still width-only, pre-Task-5) dedupe — we inspect the W column in isolation.
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

// Points of the OUTER subpath (everything before the first Z) as {x,y}.
function outerPoints(d) {
  const first = d.split('Z')[0];
  const nums = first.match(/-?[\d.]+/g).map(Number);
  const pts = [];
  for (let i = 0; i < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
  return pts;
}

const round2 = (n) => Math.round(n * 100) / 100;
// most-frequent value (the straight rail: 2 corner points per rib dominate apex/notch).
function mode(values) {
  const counts = new Map();
  let best = values[0];
  let bestN = 0;
  for (const v of values) {
    const k = round2(v);
    const c = (counts.get(k) || 0) + 1;
    counts.set(k, c);
    if (c > bestN) { bestN = c; best = k; }
  }
  return best;
}

describe('renderRibLadderSVG — interlock rail routing (points OUT, notches IN)', () => {
  it('(a) narrow ribs dent BOTH rails inward; wide ribs point BOTH rails outward', () => {
    const il = ladder({ cornerMode: 'interlock' });
    const pts = outerPoints(ladderPaths(il.svg, 'W')[0].d);
    const xs = pts.map((p) => p.x);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2; // column centre
    const leftXs = xs.filter((x) => x < cx);
    const rightXs = xs.filter((x) => x > cx);
    const railL = mode(leftXs);  // straight (grown) left rail
    const railR = mode(rightXs); // straight (grown) right rail

    // WIDE rib point protrudes OUTWARD past each rail:
    expect(Math.min(...leftXs)).toBeLessThan(railL - 1e-6);     // left point < left rail
    expect(Math.max(...rightXs)).toBeGreaterThan(railR + 1e-6); // right point > right rail

    // NARROW rib notch dents INWARD from each rail (the Task-3 behaviour under test):
    const leftDent = Math.max(...leftXs);   // rightmost left-half point = inward dent
    const rightDent = Math.min(...rightXs); // leftmost right-half point = inward dent
    expect(leftDent).toBeGreaterThan(railL + 1e-6);  // left rail dented inward
    expect(rightDent).toBeLessThan(railR - 1e-6);    // right rail dented inward

    // dents stay strictly INSIDE the column (0 < x < width, per the contract):
    expect(leftDent).toBeGreaterThan(railL);
    expect(leftDent).toBeLessThan(railR);
    expect(rightDent).toBeLessThan(railR);
    expect(rightDent).toBeGreaterThan(railL);
  });

  it('(b) still ONE connected path per family; connector tabs preserved (M count === ribCount)', () => {
    const il = ladder({ cornerMode: 'interlock' });
    expect(ladderPaths(il.svg, 'W').length).toBe(1);
    expect(ladderPaths(il.svg, 'H').length).toBe(1);
    const d = ladderPaths(il.svg, 'W')[0].d;
    // outer + (ribCount-1) middle connector-tab notches = ribCount subpaths
    expect((d.match(/M /g) || []).length).toBe(il.metrics.ribCount);
  });

  it('(c) clear mode: straight rails — no apex, no inward dent', () => {
    const clr = ladder({ cornerMode: 'clear' });
    const xs = outerPoints(ladderPaths(clr.svg, 'W')[0].d).map((p) => p.x);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const leftXs = xs.filter((x) => x < cx);
    const rightXs = xs.filter((x) => x > cx);
    // every left point is the SAME straight rail; likewise every right point.
    expect(Math.max(...leftXs) - Math.min(...leftXs)).toBeLessThan(1e-6);
    expect(Math.max(...rightXs) - Math.min(...rightXs)).toBeLessThan(1e-6);
  });
});
