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

// Fold-line band edges (each rib's y=0/depth at the shared datum) and the rib mid-heights. The
// CORRECTED interlock apex sits ON a band edge; the deleted concave-notch hexagon put its apex at
// the rib MID-HEIGHT — so pinning apex/vertex y to a band edge (never a mid-band) catches that.
function foldLines({ params, metrics }) {
  const datum = params.endMargin;
  const bandEdges = [];
  const midBands = [];
  for (let r = 0; r < metrics.ribCount; r++) {
    const yTop = datum + r * metrics.pitch;
    bandEdges.push(yTop, yTop + params.rib);
    midBands.push(yTop + params.rib / 2);
  }
  return { bandEdges, midBands };
}
const distTo = (y, ys) => Math.min(...ys.map((e) => Math.abs(y - e)));

describe('renderRibLadderSVG — interlock trapezoid rail routing (point OUT, setback IN)', () => {
  it('(a) interlock ribs project a point OUTWARD past a rail and set the cut-off edge IN', () => {
    const il = ladder({ cornerMode: 'interlock' });
    const pts = outerPoints(ladderPaths(il.svg, 'W')[0].d);

    // HARDEN (band-edge apex): the deleted concave-notch hexagon ALSO satisfied "point OUT /
    // setback IN", but placed its apex at the rib MID-HEIGHT. Pin every OUTWARD reach jut onto a
    // FOLD-LINE band edge (y≈0/depth), never mid-depth — clear rails come from the qty/spine marks.
    const colX0a = Number(/<text data-role="qty" data-face="W"[^>]*\bx="([-\d.]+)"/.exec(il.svg)[1]);
    const spineCxa = Number(/<line data-role="spine" data-face="W"[^>]*\bx1="([-\d.]+)"/.exec(il.svg)[1]);
    const clearWa = 2 * (spineCxa - colX0a);
    const fl = foldLines(il);
    const juts = pts.filter((p) => p.x < colX0a - 0.5 || p.x > colX0a + clearWa + 0.5);
    expect(juts.length).toBeGreaterThan(0); // the interlock point actually projects OUT past a rail
    for (const p of juts) {
      expect(distTo(p.y, fl.bandEdges)).toBeLessThan(0.3);                       // apex ON a fold line
      expect(distTo(p.y, fl.midBands)).toBeGreaterThan(il.params.rib / 2 - 0.5); // NOT the rib mid-height
    }

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
    // HARDEN: the trace is stitched purely from band edges — EVERY outer vertex sits on a fold line,
    // never at a rib mid-height (where the deleted concave-notch hexagon put its apex).
    const midBands = foldLines(il).midBands;
    for (const p of outerPoints(d)) {
      expect(distTo(p.y, midBands)).toBeGreaterThan(il.params.rib / 2 - 0.5);
    }
  });

  it('(c) clear mode: straight rails — no projecting point, no inward setback', () => {
    const clr = ladder({ cornerMode: 'clear' });
    const cpts = outerPoints(ladderPaths(clr.svg, 'W')[0].d);
    // HARDEN: clear rails also lie on fold-line band edges — no vertex at a rib mid-height.
    const midBands = foldLines(clr).midBands;
    for (const p of cpts) expect(distTo(p.y, midBands)).toBeGreaterThan(clr.params.rib / 2 - 0.5);
    const xs = cpts.map((p) => p.x);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const leftXs = xs.filter((x) => x < cx);
    const rightXs = xs.filter((x) => x > cx);
    // every left point is the SAME straight rail; likewise every right point.
    expect(Math.max(...leftXs) - Math.min(...leftXs)).toBeLessThan(1e-6);
    expect(Math.max(...rightXs) - Math.min(...rightXs)).toBeLessThan(1e-6);
  });

  it('(d) interlock connector tabs: notch stays within outer boundary at every gap (tabW material on each side)', () => {
    // Default params: rib=12, cornerAllowance=15 → reach=setback=6, tabW=2.
    // At INWARD-gap transitions (leading bottom / rear top): outer spans [colX0+setback, colX0+w-setback].
    // The old code used nl=colX0+tabW (2 < setback=6) → notch exceeded the outer boundary, leaving
    // ZERO connector tab material. The fix clamps nl/nr to the actual outer boundary ± tabW.
    const il = ladder({ cornerMode: 'interlock' });
    const d = ladderPaths(il.svg, 'W')[0].d;
    // Each Z-delimited subpath: subpaths[0] = outer boundary, subpaths[1..] = notch rectangles.
    const subpaths = d.split('Z').map((s) => s.trim()).filter(Boolean);
    expect(subpaths.length).toBeGreaterThanOrEqual(2); // at least one notch
    const parseSubpath = (s) => {
      const nums = s.match(/-?[\d.]+/g).map(Number);
      const pts = [];
      for (let i = 0; i < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
      return pts;
    };
    const outerPts = parseSubpath(subpaths[0]);
    // Find the outer polygon x-range at a given y by ray-casting along edges.
    const outerBoundsAtY = (y) => {
      const xs = [];
      const eps2 = 1e-6;
      for (let i = 0; i < outerPts.length; i++) {
        const a = outerPts[i];
        const b = outerPts[(i + 1) % outerPts.length];
        const lo = Math.min(a.y, b.y);
        const hi = Math.max(a.y, b.y);
        if (y < lo - eps2 || y > hi + eps2) continue;
        const t = Math.abs(b.y - a.y) < eps2 ? 0.5 : (y - a.y) / (b.y - a.y);
        xs.push(a.x + Math.max(0, Math.min(1, t)) * (b.x - a.x));
      }
      return xs.length ? { minX: Math.min(...xs), maxX: Math.max(...xs) } : null;
    };
    const eps = 1e-6;
    for (let n = 1; n < subpaths.length; n++) {
      const notchPts = parseSubpath(subpaths[n]);
      const notchYs = notchPts.map((p) => p.y);
      const midY = (Math.min(...notchYs) + Math.max(...notchYs)) / 2;
      const notchMinX = Math.min(...notchPts.map((p) => p.x));
      const notchMaxX = Math.max(...notchPts.map((p) => p.x));
      const outer = outerBoundsAtY(midY);
      expect(outer).not.toBeNull();
      // Notch must sit strictly inside the outer boundary — tab material > 0 on each side.
      expect(notchMinX).toBeGreaterThan(outer.minX + eps);  // left tab material > 0
      expect(notchMaxX).toBeLessThan(outer.maxX - eps);     // right tab material > 0
    }
  });

  it('(e) FIX1: connector-tab notches never land ON the interlock point — every notch x stays within the clear width [0, width]', () => {
    // DEFAULT interlock: frontW=160, cornerAllowance=15 → width=130, reach=setback=6, tabW=2, kerf=0.15.
    // At an OUTWARD interlock gap (rear bottom / leading top) BOTH adjacent rib edges are the WIDE
    // base (-reach / width+reach = the POINT TIPS). Flooring the notch at the RAW outer boundary
    // relocated the snap-apart tab to x≈-reach / x≈width+reach — ON the interlock point, 6 mm outside
    // the clear width. The fix floors/caps the notch at the clear width [0, width] so the break scar
    // lands on the clear edge, off the point. (Half of all gaps are outward, so half were affected.)
    const il = ladder({ cornerMode: 'interlock' });
    const { kerf } = il.params;
    const tabW = Math.max(1, Math.min(2, il.params.cornerAllowance)); // 2 at defaults

    // Clear-width origin (colX0) from the qty label; column centre from the spine → the clear width.
    const colX0 = Number(/<text data-role="qty" data-face="W"[^>]*\bx="([-\d.]+)"/.exec(il.svg)[1]);
    const spineCx = Number(/<line data-role="spine" data-face="W"[^>]*\bx1="([-\d.]+)"/.exec(il.svg)[1]);
    const width = 2 * (spineCx - colX0);

    const d = ladderPaths(il.svg, 'W')[0].d;
    const subs = d.split('Z').map((s) => s.trim()).filter(Boolean);
    const parse = (s) => {
      const nums = s.match(/-?[\d.]+/g).map(Number);
      const pts = [];
      for (let i = 0; i < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
      return pts;
    };
    const notches = subs.slice(1).map(parse); // subs[0] = outer boundary; the rest are tab notches
    expect(notches.length).toBeGreaterThan(0);

    const eps = 1e-6;
    const relLs = [];
    const relRs = [];
    for (const n of notches) {
      const relL = Math.min(...n.map((p) => p.x)) - colX0; // notch left edge, column-relative
      const relR = Math.max(...n.map((p) => p.x)) - colX0; // notch right edge, column-relative
      relLs.push(relL);
      relRs.push(relR);
      // EVERY notch edge lies within the clear width [0, width] — never at x≈-reach or x≈width+reach.
      expect(relL).toBeGreaterThanOrEqual(0 - eps);
      expect(relR).toBeLessThanOrEqual(width + eps);
    }
    // The OUTWARD-gap notches are capped to the clear rail, so the tab lands on the clear edge:
    // left edge in [0, tabW+kerf], right edge in [width-tabW-kerf, width] (never on the point tip).
    expect(Math.min(...relLs)).toBeGreaterThanOrEqual(0 - eps);
    expect(Math.min(...relLs)).toBeLessThanOrEqual(tabW + kerf);
    expect(Math.max(...relRs)).toBeGreaterThanOrEqual(width - tabW - kerf);
    expect(Math.max(...relRs)).toBeLessThanOrEqual(width + eps);
  });
});
