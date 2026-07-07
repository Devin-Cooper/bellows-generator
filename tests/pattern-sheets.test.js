// tests/pattern-sheets.test.js
import { describe, it, expect } from 'vitest';
import { renderPatternSheets, planBedTiles } from '../src/render/svg.js';
import { downloadPatternSheets } from '../src/export/download.js';
import { buildPatternModel } from '../src/geometry/index.js';
import { DEFAULT_PARAMS } from '../src/params.js';

// Standalone bed grid (matches the DEFAULT_PARAMS bedW/bedH added in Task 5).
const BED = { bedW: 609.6, bedH: 406.4 };

// fmt mirror of the private formatter in src/render/svg.js (rounds to 1e-4).
const fmtNum = (n) => String(Math.round(n * 1e4) / 1e4);

function parseRects(svg) {
  const out = [];
  const re = /<rect\s([^>]*?)\/?>/g;
  let m;
  while ((m = re.exec(svg)) !== null) {
    const attrs = {};
    const are = /([\w-]+)="([^"]*)"/g;
    let a;
    while ((a = are.exec(m[1])) !== null) attrs[a[1]] = a[2];
    out.push(attrs);
  }
  return out;
}

function sheetSize(svg) {
  return {
    w: parseFloat(/width="([\d.]+)mm"/.exec(svg)[1]),
    h: parseFloat(/height="([\d.]+)mm"/.exec(svg)[1]),
  };
}

function downloadHarness() {
  const anchors = [];
  const doc = {
    createElement: () => {
      const a = { href: '', download: '', click() {}, remove() {} };
      anchors.push(a);
      return a;
    },
    body: { appendChild() {} },
  };
  const urlLib = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
  return { anchors, doc, urlLib };
}

describe('planBedTiles — bed-sized grid (retired-planTiles replacement)', () => {
  it('butts tiles edge-to-edge at exactly bedW x bedH (no bleed margin)', () => {
    const plan = planBedTiles({ w: 700, h: 500 }, BED);
    expect(plan.cols).toBe(2); // ceil(700 / 609.6)
    expect(plan.rows).toBe(2); // ceil(500 / 406.4)
    expect(plan.count).toBe(4);
    expect(plan.tiles.map((t) => [t.x, t.y, t.w, t.h])).toEqual([
      [0, 0, 609.6, 406.4],
      [609.6, 0, 609.6, 406.4],
      [0, 406.4, 609.6, 406.4],
      [609.6, 406.4, 609.6, 406.4],
    ]);
  });

  it('always returns at least one tile for a tiny drawing', () => {
    const plan = planBedTiles({ w: 5, h: 5 }, BED);
    expect(plan.count).toBe(1);
    expect(plan.tiles[0]).toMatchObject({ col: 0, row: 0, x: 0, y: 0 });
  });
});

describe('renderPatternSheets — bed-sized fold-pattern master sheets', () => {
  const model = buildPatternModel({ ...DEFAULT_PARAMS });
  const sheets = renderPatternSheets(model, { ...DEFAULT_PARAMS });

  it('splits the drawing into one SVG per bed tile (rotated orientation at defaults)', () => {
    // the default 610x430 pattern auto-rotates: swapped {w:430,h:610} tiles to 2 (< un-rotated 4)
    const rotatedPlan = planBedTiles({ w: model.bounds.h, h: model.bounds.w }, DEFAULT_PARAMS);
    expect(rotatedPlan.count).toBeLessThan(planBedTiles(model.bounds, DEFAULT_PARAMS).count);
    expect(sheets.length).toBe(rotatedPlan.count);
  });

  it('the default (flatWidth 610 > bedW 609.6) overflows to >= 2 sheets', () => {
    expect(sheets.length).toBeGreaterThanOrEqual(2);
  });

  it('sizes every sheet at exactly bedW x bedH mm (1:1) with a matching viewBox', () => {
    for (const svg of sheets) {
      const { w, h } = sheetSize(svg);
      expect(w).toBeCloseTo(DEFAULT_PARAMS.bedW, 6);
      expect(h).toBeCloseTo(DEFAULT_PARAMS.bedH, 6);
      expect(svg).toContain(`viewBox="0 0 ${DEFAULT_PARAMS.bedW} ${DEFAULT_PARAMS.bedH}"`);
    }
  });

  it('crops each sheet to the bed rect and translates content by the (rotated) tile origin', () => {
    // defaults rotate, so the per-tile offsets come from the swapped-bounds plan
    const plan = planBedTiles({ w: model.bounds.h, h: model.bounds.w }, DEFAULT_PARAMS);
    sheets.forEach((svg, i) => {
      const t = plan.tiles[i];
      expect(svg).toContain('clip-path="url(#bed)"');
      expect(svg).toContain(
        `<clipPath id="bed"><rect x="0" y="0" ` +
          `width="${DEFAULT_PARAMS.bedW}" height="${DEFAULT_PARAMS.bedH}"/></clipPath>`
      );
      expect(svg).toContain(`translate(${fmtNum(-t.x)},${fmtNum(-t.y)})`);
    });
  });

  it('stamps exactly one 50 mm calibration square (with label) on every sheet', () => {
    for (const svg of sheets) {
      const cal = parseRects(svg).filter((r) => r['data-role'] === 'calibration');
      expect(cal.length).toBe(1);
      expect(parseFloat(cal[0].width)).toBeCloseTo(50, 6);
      expect(parseFloat(cal[0].height)).toBeCloseTo(50, 6);
      expect(/data-role="calibration-label"[^>]*>50 mm<\/text>/.test(svg)).toBe(true);
      // calibration lives in sheet-local coords and stays inside the bed
      expect(parseFloat(cal[0].y) + 50).toBeLessThanOrEqual(DEFAULT_PARAMS.bedH + 1e-6);
    }
  });

  it('emits no crop marks / page-N labels (retired tiled-PDF artifacts)', () => {
    for (const svg of sheets) expect(svg).not.toMatch(/Page \d+\/\d+/);
  });
});

describe('downloadPatternSheets', () => {
  it('downloads one bellows-fold-pattern-sheet-N.svg per bed sheet', () => {
    const { anchors, doc, urlLib } = downloadHarness();
    const n = downloadPatternSheets(['<svg/>', '<svg/>', '<svg/>'], { doc, urlLib });
    expect(n).toBe(3);
    expect(anchors.map((a) => a.download)).toEqual([
      'bellows-fold-pattern-sheet-1.svg',
      'bellows-fold-pattern-sheet-2.svg',
      'bellows-fold-pattern-sheet-3.svg',
    ]);
  });
});

// --- helpers for the auto-rotate assertions ---------------------------------
// Every transform="" on a fold-pattern sheet lives on the content <g> wrappers (the calibration
// and legend groups carry none), listed in document (outermost-first) order.
function contentTransforms(svg) {
  const out = [];
  const re = /transform="([^"]*)"/g;
  let m;
  while ((m = re.exec(svg)) !== null) {
    const tre = /(translate|rotate)\(([^)]*)\)/g;
    let t;
    while ((t = tre.exec(m[1])) !== null) {
      out.push({ op: t[1], args: t[2].split(/[\s,]+/).filter(Boolean).map(Number) });
    }
  }
  return out;
}
// Map a flat point through the nested content transforms (innermost / right-most applied first).
function applyContent(transforms, pt) {
  let { x, y } = pt;
  for (let i = transforms.length - 1; i >= 0; i--) {
    const t = transforms[i];
    if (t.op === 'translate') {
      x += t.args[0];
      y += t.args[1] || 0;
    } else {
      const a = (t.args[0] * Math.PI) / 180;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const nx = x * c - y * s;
      const ny = x * s + y * c;
      x = nx;
      y = ny;
    }
  }
  return { x, y };
}

describe('renderPatternSheets — whole-sheet 0/90 auto-rotation', () => {
  const model = buildPatternModel({ ...DEFAULT_PARAMS });
  const sheets = renderPatternSheets(model, { ...DEFAULT_PARAMS });

  it('rotates the default pattern (610x430) to 2 bed sheets instead of 4', () => {
    // un-rotated tiles 2x2 = 4; swapped {w:430,h:610} tiles 1x2 = 2 -> rotation wins
    expect(planBedTiles(model.bounds, DEFAULT_PARAMS).count).toBe(4);
    expect(
      planBedTiles({ w: model.bounds.h, h: model.bounds.w }, DEFAULT_PARAMS).count
    ).toBe(2);
    expect(sheets.length).toBe(2);
  });

  it('wraps content in translate(H,0) rotate(90) — the compensating translate, not a bare rotate', () => {
    for (const svg of sheets) {
      expect(svg).toContain(`translate(${fmtNum(model.bounds.h)},0) rotate(90)`);
    }
  });

  it('lands the rotated content on-bed with no negative coordinates (sheet 0)', () => {
    const W = model.bounds.w;
    const H = model.bounds.h;
    const T = contentTransforms(sheets[0]); // sheet 0 has no per-tile offset (translate 0,0)
    const corners = [[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => applyContent(T, { x, y }));
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-1e-6); // a bare rotate(90) => X in [-H,0]
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(-1e-6);
    expect(Math.max(...xs)).toBeLessThanOrEqual(H + 1e-6); // re-seated into rotated frame [0,H]
  });

  it('keeps clipPath#bed untransformed and calibration + legend outside the rotated group', () => {
    for (const svg of sheets) {
      // the clip group itself carries no transform (rotate/translate sit on the inner groups)
      expect(svg).toContain('<g clip-path="url(#bed)"><g transform="translate(');
      // calibration + assembly legend are emitted after the content group closes -> upright
      const tail = svg.slice(svg.lastIndexOf('</g></g>'));
      expect(tail).toContain('data-role="calibration"');
      expect(tail).toContain('longest first'); // Task-2 assembly legend, sheet-level + upright
    }
  });

  it('does NOT rotate a pattern that fits un-rotated in fewer-or-equal tiles (tie -> upright)', () => {
    const small = buildPatternModel({
      ...DEFAULT_PARAMS,
      maxDraw: 100,
      frontW: 80, frontH: 60, rearW: 80, rearH: 60,
    });
    // both orientations need a single bed tile -> tie -> keep un-rotated
    expect(planBedTiles(small.bounds, DEFAULT_PARAMS).count).toBe(1);
    expect(planBedTiles({ w: small.bounds.h, h: small.bounds.w }, DEFAULT_PARAMS).count).toBe(1);
    const smallSheets = renderPatternSheets(small, { ...DEFAULT_PARAMS });
    expect(smallSheets.length).toBe(1);
    for (const svg of smallSheets) expect(svg).not.toContain('rotate(90)');
  });
});
