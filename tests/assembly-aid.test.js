// tests/assembly-aid.test.js
import { describe, it, expect } from 'vitest';
import { renderPatternSheets, renderRibMasterSheets } from '../src/render/svg.js';
import { buildPatternModel } from '../src/geometry/index.js';
import { computeMetrics } from '../src/geometry/metrics.js';
import { normalizeParams, DEFAULT_PARAMS } from '../src/params.js';

const SHEET_MARGIN = 5;

// The 3 fixed legend lines — must match src/render/svg.js ASSEMBLY_LEGEND_LINES verbatim.
const LEGEND_LINES = [
  'Glue ribs between the fold lines, longest first; gap centred on each crease; fold after gluing',
  'Each fold line runs down the MIDDLE of a bare gap, ~gap/2 clear of each rib',
  'Corner points tuck across the gap; they do NOT meet the crease',
];

// Parse <text ...>inner</text> into { attrs, text }.
function parseTexts(svg) {
  const out = [];
  const re = /<text\s([^>]*?)>([^<]*)<\/text>/g;
  let m;
  while ((m = re.exec(svg)) !== null) {
    const attrs = {};
    const are = /([\w-]+)="([^"]*)"/g;
    let a;
    while ((a = are.exec(m[1])) !== null) attrs[a[1]] = a[2];
    out.push({ attrs, text: m[2] });
  }
  return out;
}
const legendTexts = (svg) =>
  parseTexts(svg).filter((t) => t.attrs['data-role'] === 'assembly-legend');

function ribSheets(overrides = {}) {
  const params = normalizeParams({ ...DEFAULT_PARAMS, ...overrides });
  const model = { metrics: computeMetrics(params) };
  return renderRibMasterSheets(model, params);
}
function foldSheets(overrides = {}) {
  const params = normalizeParams({ ...DEFAULT_PARAMS, ...overrides });
  const model = buildPatternModel(params);
  return { sheets: renderPatternSheets(model, params), params };
}

describe('assembly legend — sheet-level, upright, top-left, every bed sheet', () => {
  it('stamps the 3-line assembly legend on EVERY rib master sheet', () => {
    const sheets = ribSheets();
    expect(sheets.length).toBeGreaterThanOrEqual(1);
    for (const svg of sheets) {
      expect(legendTexts(svg).map((t) => t.text)).toEqual(LEGEND_LINES);
    }
  });

  it('stamps the 3-line assembly legend on EVERY fold-pattern sheet', () => {
    const { sheets } = foldSheets();
    expect(sheets.length).toBeGreaterThanOrEqual(1);
    for (const svg of sheets) {
      expect(legendTexts(svg).map((t) => t.text)).toEqual(LEGEND_LINES);
    }
  });

  it('draws the legend UPRIGHT in the sheet-local TOP-LEFT (x≈margin, small y, no rotate)', () => {
    for (const svg of [ribSheets()[0], foldSheets().sheets[0]]) {
      const lines = legendTexts(svg);
      expect(lines.length).toBe(3);
      for (const l of lines) {
        expect(parseFloat(l.attrs.x)).toBeCloseTo(SHEET_MARGIN, 6); // pinned to the left margin
        expect(parseFloat(l.attrs.y)).toBeLessThan(30);             // top band, not bottom cal
      }
      // the legend group carries NO rotate transform (stays upright after Tasks 3/4 rotate content)
      const grp = svg.slice(svg.indexOf('data-role="assembly-legend"'));
      expect(/rotate\(/.test(grp.split('</g>')[0])).toBe(false);
    }
  });

  it('legend sits in the ENGRAVE layer', () => {
    const svg = foldSheets().sheets[0];
    const idx = svg.indexOf('data-role="assembly-legend"');
    const before = svg.slice(0, idx);
    const lastGroupOpen = before.lastIndexOf('<g ');
    expect(before.slice(lastGroupOpen)).toContain('inkscape:label="ENGRAVE"');
  });
});

describe('gap/2 clearance annotation — fold-pattern content, near a transverse fold', () => {
  it('draws a gap/2 dimension + label pinned to a transverse fold-vs-rib gap', () => {
    const { sheets, params } = foldSheets();
    const joined = sheets.join('');
    const labels = parseTexts(joined).filter((t) => t.attrs['data-role'] === 'gap-dim-label');
    expect(labels.length).toBeGreaterThan(0);
    expect(labels[0].text).toContain(`gap/2 = ${params.gap / 2} mm`);
    // the dimension line spans exactly the gap/2 clearance: rib band edge -> transverse crease
    const yEdge = params.endMargin + params.rib;
    const yCrease = yEdge + params.gap / 2;
    const dimRe = new RegExp(`data-role="gap-dim" d="M [\\d.]+ ${yEdge} L [\\d.]+ ${yCrease}"`);
    expect(dimRe.test(joined)).toBe(true);
  });

  it('the gap/2 annotation lives INSIDE the pattern content group (tiles + rotates with geometry)', () => {
    const svg = foldSheets().sheets[0];
    const contentStart = svg.indexOf('transform="translate(');
    const contentEnd = svg.indexOf('</g></g>', contentStart);
    const content = svg.slice(contentStart, contentEnd);
    expect(content).toContain('data-role="gap-dim"');
    expect(content).toContain('data-role="gap-dim-label"');
  });
});

describe('assembly aid does not disturb existing sheet invariants', () => {
  it('fold-pattern sheets keep exactly one 50 mm calibration square + fit bedW×bedH', () => {
    const { sheets, params } = foldSheets();
    for (const svg of sheets) {
      const w = parseFloat(/width="([\d.]+)mm"/.exec(svg)[1]);
      const h = parseFloat(/height="([\d.]+)mm"/.exec(svg)[1]);
      expect(w).toBeCloseTo(params.bedW, 6);
      expect(h).toBeCloseTo(params.bedH, 6);
      const cal = [...svg.matchAll(/<rect ([^>]*?)\/>/g)]
        .map((m) => m[1])
        .filter((s) => /data-role="calibration"/.test(s));
      expect(cal.length).toBe(1);
    }
  });

  it('rib master sheets keep exactly one calibration square per sheet', () => {
    for (const svg of ribSheets()) {
      const cal = [...svg.matchAll(/<rect ([^>]*?)\/>/g)]
        .map((m) => m[1])
        .filter((s) => /data-role="calibration"/.test(s));
      expect(cal.length).toBe(1);
    }
  });
});
