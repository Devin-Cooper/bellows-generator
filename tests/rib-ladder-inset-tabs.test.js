// tests/rib-ladder-inset-tabs.test.js
// The laser rib-ladder connector tabs must match the 3D STL breakaway bridges: TWO tabs INSET by
// cornerAllowance from each clamped clear-span edge (a small face collapses to ONE centred tab),
// NOT the old ~2mm rails sitting AT the clear-width edges (by the interlock points / corner folds).
// traceColumn now reuses bridgeTabXs (shared with export/stl.js) for the tab positions and cuts the
// gap everywhere EXCEPT a tabW-wide strip on each tab centre, so the ribs join ONLY by the inset
// tabs and the rib ENDS are fully cut.
import { describe, it, expect } from 'vitest';
import { renderRibLadderSVG } from '../src/render/svg.js';
import { bridgeTabXs } from '../src/export/stl.js';
import { computeMetrics } from '../src/geometry/metrics.js';
import { cornerReachSetback } from '../src/geometry/ribShapes.js';
import { normalizeParams, DEFAULT_PARAMS } from '../src/params.js';

function ladder(overrides = {}) {
  const params = normalizeParams({ ...DEFAULT_PARAMS, ...overrides });
  const model = { metrics: computeMetrics(params) };
  return { svg: renderRibLadderSVG(model, params), params, metrics: model.metrics };
}

// d-string of the FIRST <path data-role="ladder"> for a face.
function ladderD(svg, face) {
  const re = /<path ([^>]*?)\/>/g;
  let m;
  while ((m = re.exec(svg)) !== null) {
    const attrs = {};
    const are = /([\w-]+)="([^"]*)"/g;
    let a;
    while ((a = are.exec(m[1])) !== null) attrs[a[1]] = a[2];
    if (attrs['data-role'] === 'ladder' && attrs['data-face'] === face) return attrs.d;
  }
  return null;
}

// Z-delimited subpaths as point arrays; [0] is the outer boundary, the rest are cut-notch rects.
function subpaths(d) {
  return d
    .split('Z')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const nums = s.match(/-?[\d.]+/g).map(Number);
      const pts = [];
      for (let i = 0; i < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
      return pts;
    });
}

const xExtent = (pts) => [Math.min(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.x))];
const yMid = (pts) => (Math.min(...pts.map((p) => p.y)) + Math.max(...pts.map((p) => p.y))) / 2;

// Group the cut-notch rectangles by the gap (y-band) they belong to; each gap returns its notch
// x-intervals sorted left->right.
function notchesByGap(subs) {
  const byBand = new Map();
  for (const notch of subs.slice(1)) {
    const key = Math.round(yMid(notch) * 100) / 100;
    if (!byBand.has(key)) byBand.set(key, []);
    byBand.get(key).push(xExtent(notch));
  }
  return [...byBand.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, ivals]) => ivals.sort((a, b) => a[0] - b[0]));
}

// The UNCUT connector tabs of one gap: the complement of the cut notches within the clear span
// [lo, hi]. Kerf leaves ~kerf/2 slivers at fully-cut ends, so keep only intervals wider than minW.
function uncutTabs(notchIvals, lo, hi, minW) {
  const ivals = notchIvals
    .map(([a, b]) => [Math.max(lo, a), Math.min(hi, b)])
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  const tabs = [];
  let cursor = lo;
  for (const [a, b] of ivals) {
    if (a - cursor > minW) tabs.push({ c: (cursor + a) / 2, w: a - cursor });
    cursor = Math.max(cursor, b);
  }
  if (hi - cursor > minW) tabs.push({ c: (cursor + hi) / 2, w: hi - cursor });
  return tabs;
}

// In CLEAR mode every rib is a plain kerf-grown rectangle, so the clear-span edges are recoverable
// straight from the outer bbox: leftClear = outerMinX + kerf/2, rightClear = outerMaxX - kerf/2.
function clearSpan(subs, half) {
  const [omin, omax] = xExtent(subs[0]);
  return { leftClear: omin + half, rightClear: omax - half };
}

describe('rib ladder — connector tabs are INSET by cornerAllowance (match the STL bridgeTabXs)', () => {
  it('each gap: TWO tabs inset by cornerAllowance from the clear edges, matching bridgeTabXs exactly', () => {
    const { svg, params } = ladder({ frontW: 150, frontH: 150, cornerMode: 'clear' });
    const half = params.kerf / 2;
    const ca = params.cornerAllowance; // 15
    const tabW = Math.min(2, ca); // 2 — the OLD edge-rail half-strip width
    const subs = subpaths(ladderD(svg, 'W'));
    const { leftClear, rightClear } = clearSpan(subs, half);
    const width = rightClear - leftClear;
    const centre = (leftClear + rightClear) / 2;
    const expected = bridgeTabXs(width, centre, ca); // [leftClear+ca, rightClear-ca]
    expect(expected.length).toBe(2);

    const gaps = notchesByGap(subs);
    expect(gaps.length).toBe(subs[0] ? gaps.length : 0);
    expect(gaps.length).toBeGreaterThan(0);
    for (const notchIvals of gaps) {
      const tabs = uncutTabs(notchIvals, leftClear, rightClear, 0.5).map((t) => t.c).sort((a, b) => a - b);
      expect(tabs.length).toBe(2);
      // INSET by ~cornerAllowance from each clear edge (NOT ~tabW=2 like the old edge rails).
      expect(tabs[0]).toBeCloseTo(leftClear + ca, 3);
      expect(tabs[1]).toBeCloseTo(rightClear - ca, 3);
      // ...and exactly the shared bridgeTabXs positions.
      expect(tabs[0]).toBeCloseTo(expected[0], 3);
      expect(tabs[1]).toBeCloseTo(expected[1], 3);
      // Explicitly NOT the old edge-rail positions (leftClear+tabW / rightClear-tabW).
      expect(tabs[0]).not.toBeCloseTo(leftClear + tabW, 1);
      expect(tabs[1]).not.toBeCloseTo(rightClear - tabW, 1);
      // Still strictly inside the clear width, off the ends.
      expect(tabs[0]).toBeGreaterThan(leftClear + 1e-6);
      expect(tabs[1]).toBeLessThan(rightClear - 1e-6);
    }
  });

  it('the rib ENDS are fully cut — no connector rails at the clear-width edges', () => {
    const { svg, params } = ladder({ frontW: 150, frontH: 150, cornerMode: 'clear' });
    const half = params.kerf / 2;
    const subs = subpaths(ladderD(svg, 'W'));
    const { leftClear, rightClear } = clearSpan(subs, half);
    for (const notchIvals of notchesByGap(subs)) {
      // A cut notch reaches each end of the clear span (only a ~kerf/2 sliver of material remains).
      const minNotchX = Math.min(...notchIvals.map(([a]) => a));
      const maxNotchX = Math.max(...notchIvals.map(([, b]) => b));
      expect(minNotchX - leftClear).toBeLessThan(0.2 + half); // fully cut at the left end
      expect(rightClear - maxNotchX).toBeLessThan(0.2 + half); // fully cut at the right end
    }
  });

  it('interlock: the cut reaches the point tips — NO uncut web joins ribs at the mountain-fold points', () => {
    // Regression for the point-web bug: on an OUTWARD interlock gap both facing band edges are the
    // WIDE base, so the outer blob fills the gap out to the point tips (x=-reach / x=width+reach). If
    // the gap cut is clamped to the clear width [0, clearW] (as it was), the triangular tip regions
    // OUTSIDE the clear width stay uncut and WELD the ribs together right at the fold points. The cut
    // must span the FULL gap extent, so its outer edges reach the outer boundary (within a kerf half).
    const { svg, params } = ladder({ frontW: 160, frontH: 115, cornerMode: 'interlock' });
    const half = params.kerf / 2;
    const reach = cornerReachSetback(params.rib, params.cornerAllowance, 0).reach;
    expect(reach).toBeGreaterThan(1); // the bug only exists when the points actually protrude
    const subs = subpaths(ladderD(svg, 'W'));
    const [oMin, oMax] = xExtent(subs[0]);
    const notches = subs.slice(1);
    const nMin = Math.min(...notches.map((n) => Math.min(...n.map((p) => p.x))));
    const nMax = Math.max(...notches.map((n) => Math.max(...n.map((p) => p.x))));
    // Some outward gap's cut must reach each point tip: leftmost cut ≈ outer left, rightmost ≈ outer
    // right (only the kerf-half offset between them). A residual ≈ reach would be the uncut web.
    expect(nMin - (oMin + half)).toBeLessThan(0.3); // no left-tip web (was ≈ reach)
    expect(oMax - half - nMax).toBeLessThan(0.3); // no right-tip web (was ≈ reach)
  });

  it('interlock: tabs sit INSET from the CLEAR edges (off the points), matching bridgeTabXs', () => {
    const { svg, params } = ladder({ frontW: 160, frontH: 115, cornerMode: 'interlock' });
    const half = params.kerf / 2;
    const ca = params.cornerAllowance;
    const reach = cornerReachSetback(params.rib, params.cornerAllowance, 0).reach;
    const subs = subpaths(ladderD(svg, 'W'));
    const gaps = notchesByGap(subs);
    expect(gaps.length).toBeGreaterThan(0);
    // Per-gap cut extents (pre-offset), reconstructed from each gap's own notch rectangles.
    const extents = gaps.map((iv) => ({
      iv,
      gLo: Math.min(...iv.map(([a]) => a)) - half,
      gHi: Math.max(...iv.map(([, b]) => b)) + half,
    }));
    // The clear edges come miter-free from the WIDEST (outward) gap: its cut reaches the point tips
    // at colX0-reach / colX0+width+reach, so leftClear = gLo+reach, rightClear = gHi-reach. (Deriving
    // them from the OUTER boundary would be off by the acute-point miter overshoot.)
    const widest = extents.reduce((m, e) => (e.gHi - e.gLo > m.gHi - m.gLo ? e : m));
    const leftClear = widest.gLo + reach;
    const rightClear = widest.gHi - reach;
    for (const { iv, gLo, gHi } of extents) {
      // Tab span = the clear overlap clamped to this gap's extent (exactly the fixed code's tabLo/
      // tabHi), then inset by cornerAllowance via bridgeTabXs.
      const tabLo = Math.max(leftClear, gLo);
      const tabHi = Math.min(rightClear, gHi);
      const expected = bridgeTabXs(tabHi - tabLo, (tabLo + tabHi) / 2, ca);
      const tabs = uncutTabs(iv, gLo, gHi, 0.5).map((t) => t.c).sort((a, b) => a - b);
      expect(tabs.length).toBe(expected.length);
      for (let k = 0; k < tabs.length; k++) expect(tabs[k]).toBeCloseTo(expected[k], 1);
      // Every tab is inside the clear span — never on a point tip (which sit reach beyond the edges).
      for (const t of tabs) {
        expect(t).toBeGreaterThan(leftClear - 1e-6);
        expect(t).toBeLessThan(rightClear + 1e-6);
      }
    }
  });
});

describe('rib ladder — connectivity preserved (ribs never fully severed)', () => {
  it('every gap leaves at least one connector tab (default clear)', () => {
    const { svg, params } = ladder({ frontW: 150, frontH: 150, cornerMode: 'clear' });
    const half = params.kerf / 2;
    const subs = subpaths(ladderD(svg, 'W'));
    const { leftClear, rightClear } = clearSpan(subs, half);
    const gaps = notchesByGap(subs);
    expect(gaps.length).toBeGreaterThan(0);
    for (const notchIvals of gaps) {
      expect(uncutTabs(notchIvals, leftClear, rightClear, 0.5).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('a SMALL face leaves exactly ONE centred tab per gap', () => {
    const { svg, params } = ladder({ frontW: 34, frontH: 34, cornerMode: 'clear' }); // clear width = 4
    const half = params.kerf / 2;
    const ca = params.cornerAllowance;
    const tabW = Math.max(1, Math.min(2, ca));
    const clearWidth = 34 - 2 * ca; // 4
    expect(clearWidth).toBeLessThan(2 * (ca + tabW / 2)); // qualifies as a small face
    const subs = subpaths(ladderD(svg, 'W'));
    const { leftClear, rightClear } = clearSpan(subs, half);
    const centre = (leftClear + rightClear) / 2;
    const gaps = notchesByGap(subs);
    expect(gaps.length).toBeGreaterThan(0);
    for (const notchIvals of gaps) {
      const tabs = uncutTabs(notchIvals, leftClear, rightClear, 0.5);
      expect(tabs.length).toBe(1);
      expect(tabs[0].c).toBeCloseTo(centre, 3); // one centred tab
    }
  });

  it('at cornerAllowance=0 the lattice still never severs (tabs collapse to the edges)', () => {
    const { svg, params } = ladder({ frontW: 150, frontH: 150, cornerMode: 'clear', cornerAllowance: 0 });
    const half = params.kerf / 2;
    const subs = subpaths(ladderD(svg, 'W'));
    const { leftClear, rightClear } = clearSpan(subs, half);
    const gaps = notchesByGap(subs);
    expect(gaps.length).toBeGreaterThan(0);
    for (const notchIvals of gaps) {
      // >=1 uncut tab survives (floor tabW=1 at ca=0), so the ribs remain joined.
      const tabs = uncutTabs(notchIvals, leftClear, rightClear, 0.3);
      expect(tabs.length).toBeGreaterThanOrEqual(1);
      const totalTab = tabs.reduce((s, t) => s + t.w, 0);
      expect(totalTab).toBeGreaterThan(0.5); // material remains -> never severed
    }
  });
});
