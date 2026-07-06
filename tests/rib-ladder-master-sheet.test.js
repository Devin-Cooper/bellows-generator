// tests/rib-ladder-master-sheet.test.js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderRibMasterSheets, renderRibLadderSVG } from '../src/render/svg.js';
import { computeMetrics } from '../src/geometry/metrics.js';
import { normalizeParams, DEFAULT_PARAMS } from '../src/params.js';

function ctx(overrides = {}) {
  const params = normalizeParams({ ...DEFAULT_PARAMS, ...overrides });
  const model = { metrics: computeMetrics(params) };
  return { params, model, metrics: model.metrics };
}

function pathAttrs(svg) {
  const out = [];
  const re = /<path ([^>]*?)\/>/g;
  let m;
  while ((m = re.exec(svg)) !== null) {
    const attrs = {};
    const are = /([\w-]+)="([^"]*)"/g;
    let a;
    while ((a = are.exec(m[1])) !== null) attrs[a[1]] = a[2];
    if (attrs['data-role'] === 'ladder') out.push(attrs);
  }
  return out;
}
function allPaths(sheets) {
  return sheets.flatMap(pathAttrs);
}
function bboxOfD(d) {
  const nums = d.replace(/[MLZ]/g, ' ').trim().match(/-?[\d.]+/g).map(Number);
  const xs = [];
  const ys = [];
  for (let i = 0; i < nums.length; i += 2) { xs.push(nums[i]); ys.push(nums[i + 1]); }
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}
const sheetDim = (svg) => ({
  w: Number(svg.match(/width="([\d.]+)mm"/)[1]),
  h: Number(svg.match(/height="([\d.]+)mm"/)[1]),
});

describe('renderRibMasterSheets — bed-sized rib master sheets', () => {
  it('returns an array of valid bedW x bedH SVG sheets', () => {
    const { model, params } = ctx();
    const sheets = renderRibMasterSheets(model, params);
    expect(Array.isArray(sheets)).toBe(true);
    expect(sheets.length).toBeGreaterThanOrEqual(1);
    for (const svg of sheets) {
      expect(svg.startsWith('<svg')).toBe(true);
      const d = sheetDim(svg);
      expect(d.w).toBeCloseTo(params.bedW, 4);
      expect(d.h).toBeCloseTo(params.bedH, 4);
    }
  });

  it('shows all 4 walls UNCOMBINED — 2 W + 2 H, no dedupe, no "cut xN" note', () => {
    const { model, params } = ctx({ frontW: 150, frontH: 150 }); // square: still 4 distinct walls
    const sheets = renderRibMasterSheets(model, params);
    const walls = new Set(allPaths(sheets).map((a) => `${a['data-face']}${a['data-wall']}`));
    expect(walls).toEqual(new Set(['W0', 'W2', 'H1', 'H3']));
    const joined = sheets.join('');
    expect(/cut x\d/.test(joined)).toBe(false);
    expect(joined.includes('data-qty')).toBe(false);
  });

  it('splits a wall too tall for either orientation into segments (each its own lattice)', () => {
    // maxDraw 600 -> a ~50-rib stack (~722mm) exceeds BOTH usableW (599.6) and usableH (341.4), so
    // even the fewest-segment (rotated) orientation must bed-wrap: the wall appears as >=2 segments.
    const { model, params, metrics } = ctx({ maxDraw: 600 });
    const sheets = renderRibMasterSheets(model, params);
    const paths = allPaths(sheets);
    const segsByWall = new Map();
    for (const a of paths) {
      const key = `${a['data-face']}${a['data-wall']}`;
      if (!segsByWall.has(key)) segsByWall.set(key, new Set());
      segsByWall.get(key).add(a['data-seg']);
    }
    expect([...segsByWall.values()].some((s) => s.size >= 2)).toBe(true);
    // no single lattice spans the whole stack -> it really was split (path d extent, rotated frame
    // maps the stack onto local Y so maxY-minY is the segment's stack length)
    const fullStack = (metrics.ribCount - 1) * metrics.pitch + params.rib;
    const tallest = Math.max(...paths.map((a) => { const b = bboxOfD(a.d); return b.maxY - b.minY; }));
    expect(tallest).toBeLessThan(fullStack);
  });

  it('every sheet fits within bedW x bedH and carries exactly one calibration square', () => {
    const { model, params } = ctx();
    const sheets = renderRibMasterSheets(model, params);
    for (const svg of sheets) {
      const { w, h } = sheetDim(svg);
      for (const a of pathAttrs(svg)) {
        const b = bboxOfD(a.d);
        expect(b.minX).toBeGreaterThanOrEqual(-1e-6);
        expect(b.minY).toBeGreaterThanOrEqual(-1e-6);
        expect(b.maxX).toBeLessThanOrEqual(w + 1e-6);
        expect(b.maxY).toBeLessThanOrEqual(h + 1e-6);
      }
      const cal = [...svg.matchAll(/<rect ([^>]*?)\/>/g)]
        .map((m) => m[1])
        .filter((s) => /data-role="calibration"/.test(s));
      expect(cal.length).toBe(1);
      const cw = Number(cal[0].match(/width="([\d.]+)"/)[1]);
      const cy = Number(cal[0].match(/\by="([\d.]+)"/)[1]);
      const ch = Number(cal[0].match(/height="([\d.]+)"/)[1]);
      expect(cw).toBeCloseTo(50, 6);
      expect(cy + ch).toBeLessThanOrEqual(h + 1e-6);
    }
  });

  it('overflows onto multiple bed sheets at defaults', () => {
    const { model, params } = ctx();
    expect(renderRibMasterSheets(model, params).length).toBeGreaterThanOrEqual(2);
  });

  it('interlock walls still tile onto the bed (trapezoid columns stay on-sheet)', () => {
    const { model, params } = ctx({ cornerMode: 'interlock' });
    const sheets = renderRibMasterSheets(model, params);
    const walls = new Set(allPaths(sheets).map((a) => `${a['data-face']}${a['data-wall']}`));
    expect(walls).toEqual(new Set(['W0', 'W2', 'H1', 'H3']));
    for (const svg of sheets) {
      const { w, h } = sheetDim(svg);
      // Rotated blocks emit block-local coords; project through translate+rotate(90) for screen x.
      // Un-rotated blocks emit absolute coords; check path bbox directly.
      const rotGroups = new Map();
      const gre = /<g transform="translate\(([-\d.]+),\s*([-\d.]+)\)\s+rotate\(90\)">(.*?)<\/g>/gs;
      let gm;
      while ((gm = gre.exec(svg)) !== null) {
        const pm = /data-role="ladder"[^>]*\bd="([^"]+)"/.exec(gm[3]);
        if (!pm) continue;
        rotGroups.set(pm[1], { X: Number(gm[1]), Y: Number(gm[2]) });
      }
      for (const a of pathAttrs(svg)) {
        const b = bboxOfD(a.d);
        if (rotGroups.has(a.d)) {
          // SVG rotate(90): local(x,y) -> (-y,x); translate(X,Y) -> screen(X-y, Y+x)
          const { X } = rotGroups.get(a.d);
          const screenMinX = X - b.maxY, screenMaxX = X - b.minY;
          expect(screenMinX).toBeGreaterThanOrEqual(-1e-6);
          expect(screenMaxX).toBeLessThanOrEqual(w + 1e-6);
        } else {
          expect(b.minX).toBeGreaterThanOrEqual(-1e-6);
          expect(b.maxX).toBeLessThanOrEqual(w + 1e-6);
        }
      }
    }
  });
});

describe('renderRibMasterSheets — too-wide rib wall warning (uncuttable sheet)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('warns naming the chosen-orientation bed dimension when even the best orientation overflows', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // 100x100 bed: usableW=90, usableH=35. A default wall (~120mm wide) overflows BOTH; the packer
    // picks the fewest-segment orientation (rotated), whose cross-dim is the bed HEIGHT (usableH=35).
    const { model, params } = ctx({ bedW: 100, bedH: 100 });
    const usableH = params.bedH - 3 * 5 - 50;
    renderRibMasterSheets(model, params);
    const overflowWarns = warn.mock.calls
      .map((c) => String(c[0]))
      .filter((m) => /exceeds usable bed (width|height)/.test(m));
    expect(overflowWarns.length).toBeGreaterThan(0);
    // Names the wall (face+index) and reports the numeric overflow against the CHOSEN cross dim.
    expect(overflowWarns.some((m) => /\b[WH]\d\b/.test(m))).toBe(true);
    expect(overflowWarns.some((m) => /exceeds usable bed height/.test(m))).toBe(true);
    expect(overflowWarns.some((m) => m.includes(usableH.toFixed(1)))).toBe(true);
  });

  it('does NOT warn at default params (every wall fits a bed orientation)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { model, params } = ctx();
    renderRibMasterSheets(model, params);
    const overflowWarns = warn.mock.calls
      .map((c) => String(c[0]))
      .filter((m) => /exceeds usable bed (width|height)/.test(m));
    expect(overflowWarns.length).toBe(0);
  });
});

describe('renderRibLadderSVG — combined reference is uncombined (no dedupe / no cut xN)', () => {
  it('emits all 4 walls as separate columns, no "cut xN", no data-qty', () => {
    const { model, params } = ctx({ frontW: 150, frontH: 150 });
    const svg = renderRibLadderSVG(model, params);
    const walls = pathAttrs(svg).map((a) => `${a['data-face']}${a['data-wall']}`).sort();
    expect(walls).toEqual(['H1', 'H3', 'W0', 'W2']);
    expect(/cut x\d/.test(svg)).toBe(false);
    expect(svg.includes('data-qty')).toBe(false);
  });
});
