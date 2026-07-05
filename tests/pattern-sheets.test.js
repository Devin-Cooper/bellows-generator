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

  it('splits the drawing into one SVG per bed tile', () => {
    const plan = planBedTiles(model.bounds, DEFAULT_PARAMS);
    expect(sheets.length).toBe(plan.count);
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

  it('crops each sheet to the bed rect and translates content by the tile origin', () => {
    const plan = planBedTiles(model.bounds, DEFAULT_PARAMS);
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
