// tests/rib-ladder-pointed-ladder.test.js
// MIGRATED (interlock trapezoid rework): pointed/alternating are removed; cornerMode is
// {clear|interlock}. In interlock the rib-ladder trace follows each rib's TRAPEZOID: the point
// projects OUTWARD past a rail at one band edge (x < railL or x > railR) and the short cut-off
// edge sets IN past the opposite rail at the other band edge — one diagonal per rib end. Clear
// mode keeps straight rails. The trace stays ONE connected path with its connector-tab notches
// (M count === ribCount).
import { describe, it, expect } from 'vitest';
import { renderRibLadderSVG } from '../src/render/svg.js';
import { computeMetrics } from '../src/geometry/metrics.js';
import { normalizeParams, DEFAULT_PARAMS } from '../src/params.js';

// non-square (160x115) so W and H columns keep distinct widths and are NOT merged by the
// (still width-aware, pre-Task-6) dedupe — we inspect the W column in isolation.
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
// most-frequent value (the grown rail x dominates the diagonal apex/setback x's).
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

describe('renderRibLadderSVG — interlock trapezoid rail routing (point OUT, setback IN)', () => {
  it('(a) interlock ribs project a point OUTWARD past a rail and set the cut-off edge IN', () => {
    const il = ladder({ cornerMode: 'interlock' });
    const pts = outerPoints(ladderPaths(il.svg, 'W')[0].d);
    const xs = pts.map((p) => p.x);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2; // column centre
    const leftXs = xs.filter((x) => x < cx);
    const rightXs = xs.filter((x) => x > cx);
    const railL = mode(leftXs);  // grown left rail (the clear-width edge)
    const railR = mode(rightXs); // grown right rail

    // the trapezoid POINT juts OUTWARD past each rail (reach projection):
    expect(Math.min(...leftXs)).toBeLessThan(railL - 1e-6);     // left point < left rail
    expect(Math.max(...rightXs)).toBeGreaterThan(railR + 1e-6); // right point > right rail

    // the SHORT cut-off (setback) edge sits INWARD of each rail at the opposite band edge:
    const leftSetback = Math.max(...leftXs);   // rightmost left-half point = inward setback
    const rightSetback = Math.min(...rightXs); // leftmost right-half point = inward setback
    expect(leftSetback).toBeGreaterThan(railL + 1e-6);  // left setback inward of the rail
    expect(rightSetback).toBeLessThan(railR - 1e-6);    // right setback inward of the rail
    // setbacks stay strictly inside the column
    expect(leftSetback).toBeLessThan(railR);
    expect(rightSetback).toBeGreaterThan(railL);
  });

  it('(b) still ONE connected path per family; connector tabs preserved (M count === ribCount)', () => {
    const il = ladder({ cornerMode: 'interlock' });
    expect(ladderPaths(il.svg, 'W').length).toBe(1);
    expect(ladderPaths(il.svg, 'H').length).toBe(1);
    const d = ladderPaths(il.svg, 'W')[0].d;
    // outer + (ribCount-1) middle connector-tab notches = ribCount subpaths
    expect((d.match(/M /g) || []).length).toBe(il.metrics.ribCount);
  });

  it('(c) clear mode: straight rails — no projecting point, no inward setback', () => {
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
