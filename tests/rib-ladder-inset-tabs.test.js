// tests/rib-ladder-inset-tabs.test.js
// The laser rib-ladder connector tabs must match the 3D STL breakaway bridges: TWO tabs INSET by
// cornerAllowance from each clamped clear-span edge (a small face collapses to ONE centred tab),
// NOT the old ~2mm rails sitting AT the clear-width edges (by the interlock points / corner folds).
// traceColumn now reuses bridgeTabXs (shared with export/stl.js) for the tab positions and cuts the
// gap everywhere EXCEPT a tabW-wide strip on each tab centre, so the ribs join ONLY by the inset
// tabs and the rib ENDS are fully cut.
import { describe, it, expect } from 'vitest';
import { renderRibLadderSVG } from '../src/render/svg.js';
import { bridgeTabXs, computeRibOutlines } from '../src/export/stl.js';
import { computeMetrics } from '../src/geometry/metrics.js';
import { cornerReachSetback, computeRibShapes } from '../src/geometry/ribShapes.js';
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

// x-span [minX, maxX] where a CLOSED polygon crosses horizontal line y (edge intersections). Lets a
// gap's TRUE cut extent be read straight from the outer boundary, so connector tabs sitting at the
// extreme cut edges (which a notch-min/max window would miss) are still seen.
function outerXSpanAtY(pts, y) {
  const xs = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
      xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
  }
  return xs.length ? [Math.min(...xs), Math.max(...xs)] : null;
}

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

  it('interlock: tabs are inset ca from the FULL CLEAR edges (PARITY with the STL — not the old setback-narrowed span)', () => {
    // A6 face: straight (frontW=rearW etc.) so setback=reach<=ca and the connectivity clamp is a no-op
    // => the interlock tabs must inset by EXACTLY cornerAllowance from the clear edges, IDENTICAL to
    // the STL bridges. (Before parity, INWARD-gap tabs were inset from the setback-narrowed span, i.e.
    // ~setback further in.)
    const { svg, params } = ladder({ frontW: 160, frontH: 115, cornerMode: 'interlock' });
    const half = params.kerf / 2;
    const ca = params.cornerAllowance;
    const reach = cornerReachSetback(params.rib, params.cornerAllowance, 0).reach;
    const subs = subpaths(ladderD(svg, 'W'));
    const gaps = notchesByGap(subs);
    expect(gaps.length).toBeGreaterThan(0);
    const extents = gaps.map((iv) => ({
      iv,
      gLo: Math.min(...iv.map(([a]) => a)) - half,
      gHi: Math.max(...iv.map(([, b]) => b)) + half,
    }));
    // Clear edges miter-free from the WIDEST (outward) gap: its cut reaches the point tips at
    // colX0-reach / colX0+width+reach, so leftClear = gLo+reach, rightClear = gHi-reach.
    const widest = extents.reduce((m, e) => (e.gHi - e.gLo > m.gHi - m.gLo ? e : m));
    const leftClear = widest.gLo + reach;
    const rightClear = widest.gHi - reach;
    const clearW = rightClear - leftClear;
    for (const { iv, gLo, gHi } of extents) {
      // Tabs use the FULL clear width (== the code + the STL), then the connectivity clamp (a no-op
      // here since ca >= setback).
      const tabLo = Math.max(leftClear, gLo);
      const tabHi = Math.min(rightClear, gHi);
      const expected = bridgeTabXs(clearW, (leftClear + rightClear) / 2, ca)
        .map((c) => Math.min(tabHi, Math.max(tabLo, c)))
        .sort((a, b) => a - b);
      const tabs = uncutTabs(iv, gLo, gHi, 0.5).map((t) => t.c).sort((a, b) => a - b);
      expect(tabs.length).toBe(expected.length);
      for (let k = 0; k < tabs.length; k++) expect(tabs[k]).toBeCloseTo(expected[k], 1);
      // PARITY: inset is EXACTLY ca from BOTH clear edges (both gaps, inward and outward alike).
      expect(tabs[0] - leftClear).toBeCloseTo(ca, 1);
      expect(rightClear - tabs[tabs.length - 1]).toBeCloseTo(ca, 1);
    }
  });

  it('interlock PARITY cross-artifact: STL breakaway bridges are ALSO inset ca — same tab separation as the SVG', () => {
    // Both artifacts place tabs inset ca from the clear width W, so the two tabs of a gap are W-2ca
    // apart in BOTH. Proven by construction from the shared bridgeTabXs; this pins them to the same
    // clear width so a future edit to either side can't silently drift them apart.
    const params = normalizeParams({ ...DEFAULT_PARAMS, frontW: 160, frontH: 115, cornerMode: 'interlock' });
    const half = params.kerf / 2;
    const ca = params.cornerAllowance;
    const wRib = computeRibShapes(params).find((s) => s.face === 'W');
    const W = wRib.width; // inset clear width
    expect(W).toBeGreaterThan(2 * ca); // a two-tab face

    // STL bridges: group by (face,segment,ribIndex) = one gap; a 2-tab gap's separation is W-2ca.
    const solids = computeRibOutlines({}, params);
    const stlGaps = new Map();
    for (const s of solids) {
      if (s.kind !== 'bridge' || s.face !== 'W') continue;
      const key = `${s.segmentIndex}:${s.ribIndex}`;
      const cx = (Math.min(...s.points.map((p) => p.x)) + Math.max(...s.points.map((p) => p.x))) / 2;
      if (!stlGaps.has(key)) stlGaps.set(key, []);
      stlGaps.get(key).push(cx);
    }
    const stlSeps = [...stlGaps.values()].filter((cs) => cs.length === 2).map((cs) => Math.abs(cs[1] - cs[0]));
    expect(stlSeps.length).toBeGreaterThan(0);
    for (const sep of stlSeps) expect(sep).toBeCloseTo(W - 2 * ca, 3); // STL inset == ca

    // SVG tabs: same separation W-2ca on every gap. Count the checked gaps so the loop can't pass
    // vacuously (e.g. if a future change collapsed every gap to !=2 tabs or broke the notch parse).
    const subs = subpaths(ladderD(renderRibLadderSVG({ metrics: computeMetrics(params) }, params), 'W'));
    let checked = 0;
    for (const iv of notchesByGap(subs)) {
      const gLo = Math.min(...iv.map(([a]) => a)) - half;
      const gHi = Math.max(...iv.map(([, b]) => b)) + half;
      const tabs = uncutTabs(iv, gLo, gHi, 0.5).map((t) => t.c).sort((a, b) => a - b);
      if (tabs.length !== 2) continue;
      expect(tabs[1] - tabs[0]).toBeCloseTo(W - 2 * ca, 0); // SVG inset == ca == STL inset -> PARITY
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('interlock PARITY on a NARROWING taper: STL bridge separations all match an SVG tab separation (frame-invariant)', () => {
    // On a taper each gap has its own min clear width, and setback<=ca (narrowing => taper>=0) so the
    // clamp is a no-op. The tab SEPARATION (minClearW-2ca) is frame-invariant, so every STL bridge
    // separation must equal SOME SVG tab separation (STL bed-wraps, dropping bridges at bed seams, so
    // it is a subset). NOTE: the ABSOLUTE position still differs on the WIDER rib by (wWide-wNarrow)/2
    // because the ladder LEFT-aligns ribs while the STL CENTER-aligns them — separation is the shared,
    // frame-invariant parity invariant.
    const params = normalizeParams({ ...DEFAULT_PARAMS, frontW: 120, frontH: 120, rearW: 200, rearH: 200, type: 'tapered', cornerMode: 'interlock' });
    const half = params.kerf / 2;
    const ca = params.cornerAllowance;
    // setback<=ca everywhere here (narrowing) so the clamp is a genuine no-op.
    const maxSetback = Math.max(
      ...computeRibShapes(params).filter((s) => s.face === 'W').map((s) => Math.min(...s.points.filter((p) => p.x >= 0).map((p) => p.x)))
    );
    expect(maxSetback).toBeLessThanOrEqual(ca + 1e-6);

    const solids = computeRibOutlines({}, params);
    const stlGaps = new Map();
    for (const s of solids) {
      if (s.kind !== 'bridge' || s.face !== 'W') continue;
      const key = `${s.segmentIndex}:${s.ribIndex}`;
      const cx = (Math.min(...s.points.map((p) => p.x)) + Math.max(...s.points.map((p) => p.x))) / 2;
      if (!stlGaps.has(key)) stlGaps.set(key, []);
      stlGaps.get(key).push(cx);
    }
    const stlSeps = [...stlGaps.values()].filter((cs) => cs.length === 2).map((cs) => Math.abs(cs[1] - cs[0]));
    expect(stlSeps.length).toBeGreaterThan(1); // a real taper: several distinct widths

    const subs = subpaths(ladderD(renderRibLadderSVG({ metrics: computeMetrics(params) }, params), 'W'));
    const svgSeps = [];
    for (const iv of notchesByGap(subs)) {
      const gLo = Math.min(...iv.map(([a]) => a)) - half;
      const gHi = Math.max(...iv.map(([, b]) => b)) + half;
      const tabs = uncutTabs(iv, gLo, gHi, 0.5).map((t) => t.c).sort((a, b) => a - b);
      if (tabs.length === 2) svgSeps.push(tabs[1] - tabs[0]);
    }
    expect(new Set(stlSeps.map((s) => s.toFixed(1))).size).toBeGreaterThan(1); // genuinely varying widths
    // Every STL bridge separation matches some SVG tab separation => same min-clear-width inset (ca).
    for (const sep of stlSeps) {
      expect(svgSeps.some((v) => Math.abs(v - sep) < 0.15)).toBe(true);
    }
  });

  it('interlock WIDENING taper (setback>ca): tabs clamp to the material band — NEVER severs, stays off the tips', () => {
    // Widening taper (front WIDER than rear) => taper<0 => setback = base+|taper| can EXCEED ca. The
    // STL bridge would float off the setback material here (a separate STL issue), so the SVG clamps
    // each tab into [setback, clearW-setback] — trading exact parity for connectivity (the tabs pin to
    // the setback band edges as ~tabW slivers, still fused to both ribs). This regime is the one
    // straight/narrowing fixtures cannot reach; assert it is in the setback>ca regime and never severs.
    const { svg, params } = ladder({
      frontW: 180, frontH: 180, rearW: 100, rearH: 100, type: 'tapered', cornerAllowance: 5, rib: 12, cornerMode: 'interlock',
    });
    const half = params.kerf / 2;
    const ca = params.cornerAllowance;
    // Confirm the regime from the actual ribs: setback = inset of the NARROW band edge from x=0. A
    // WIDENING taper (rear<front => taper<0) drives setback = base+|taper| above ca on inward gaps.
    const wRibs = computeRibShapes(params).filter((s) => s.face === 'W');
    const maxSetback = Math.max(
      ...wRibs.map((s) => Math.min(...s.points.filter((p) => p.x >= 0).map((p) => p.x)))
    );
    expect(maxSetback).toBeGreaterThan(ca); // clamp is ACTIVE here (the previously-uncovered regime)
    const tabW = Math.max(1, Math.min(2, ca));

    let pinnedInwardGaps = 0; // gaps where a tab is pinned to the setback band edge (clamp ACTIVE)
    for (const face of ['W', 'H']) {
      const d = ladderD(svg, face);
      if (!d) continue;
      const subs = subpaths(d);
      const [oMin, oMax] = xExtent(subs[0]);
      // Group cut notches by gap y-band, KEEPING the mid-y so we can read the true cut extent.
      const byBand = new Map();
      for (const n of subs.slice(1)) {
        const my = yMid(n);
        const key = Math.round(my * 100) / 100;
        if (!byBand.has(key)) byBand.set(key, { midY: my, ivals: [] });
        byBand.get(key).ivals.push(xExtent(n));
      }
      expect(byBand.size).toBeGreaterThan(0);
      for (const { midY, ivals } of byBand.values()) {
        ivals.sort((a, b) => a[0] - b[0]);
        // TRUE cut extent from the outer boundary at the gap's mid-y (catches edge-sliver tabs a
        // notch-min/max window misses), pulled in by the kerf half to the pre-offset span.
        const span = outerXSpanAtY(subs[0], midY);
        expect(span).toBeTruthy();
        const cutLeft = span[0] + half;
        const cutRight = span[1] - half;
        const tabs = uncutTabs(ivals, cutLeft, cutRight, 0.3);
        // CONNECTIVITY: at least one real connector tab survives (never severed), >=0.5mm material.
        expect(tabs.length).toBeGreaterThanOrEqual(1);
        expect(tabs.reduce((s, t) => s + t.w, 0)).toBeGreaterThan(0.5);
        // BOUNDED: every tab centre is inside the outer boundary — never out on a point tip.
        for (const t of tabs) {
          expect(t.c).toBeGreaterThan(oMin + half - 1e-6);
          expect(t.c).toBeLessThan(oMax - half + 1e-6);
        }
        // CLAMP ACTIVE: only a clamped inward gap pins a tab to the setback band edge (== the cut
        // extent edge). An unclamped/outward gap insets ca well inside the wide cut extent, so a tab
        // sitting within ~tabW of the cut edge is the clamp's signature.
        if (tabs.some((t) => t.c - cutLeft < tabW + 0.3 || cutRight - t.c < tabW + 0.3)) {
          pinnedInwardGaps++;
        }
      }
    }
    expect(pinnedInwardGaps).toBeGreaterThan(0); // the clamp actually pinned tabs to the band edge
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
