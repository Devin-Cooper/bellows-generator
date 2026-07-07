import { describe, it, expect } from 'vitest';
import { renderRibMasterSheets } from '../src/render/svg.js';
import { computeMetrics } from '../src/geometry/metrics.js';
import { normalizeParams, DEFAULT_PARAMS } from '../src/params.js';

function ctx(o = {}) {
  const params = normalizeParams({ ...DEFAULT_PARAMS, ...o });
  return { params, model: { metrics: computeMetrics(params) } };
}
const ladderDs = (svgs) =>
  svgs.flatMap((svg) => [...svg.matchAll(/data-role="ladder"[^>]*?d="([^"]+)"/g)].map((m) => m[1]));
const combDs = (svgs) =>
  svgs.flatMap((svg) => [...svg.matchAll(/data-role="comb"[^>]*?d="([^"]+)"/g)].map((m) => m[1]));

describe('cut-only rib master sheets', () => {
  it('cutOnly keeps ONLY the CUT layer — no scores, engrave, calibration, or legend', () => {
    const { model, params } = ctx({ cornerCombs: true });
    const sheets = renderRibMasterSheets(model, params, { cutOnly: true });
    expect(sheets.length).toBeGreaterThan(0);
    for (const svg of sheets) {
      expect(svg).toContain('inkscape:label="CUT"');
      expect(svg).not.toContain('FOLD_MOUNTAIN');
      expect(svg).not.toContain('FOLD_VALLEY');
      expect(svg).not.toContain('inkscape:label="ENGRAVE"');
      expect(svg).not.toContain('data-role="calibration"');
      expect(svg).not.toContain('data-role="rib-label"');
      // still the bed-sized wrapper
      expect(svg).toMatch(/<svg [^>]*width="[\d.]+mm" height="[\d.]+mm"/);
    }
  });

  it('cutOnly carries the SAME cut geometry as the full export (strips only non-cut layers)', () => {
    const { model, params } = ctx({ cornerCombs: true });
    const full = renderRibMasterSheets(model, params);
    const cut = renderRibMasterSheets(model, params, { cutOnly: true });
    expect(ladderDs(cut).sort()).toEqual(ladderDs(full).sort());
    expect(combDs(cut).sort()).toEqual(combDs(full).sort());
    expect(ladderDs(cut).length).toBeGreaterThan(0);
    expect(combDs(cut).length).toBe(4); // 4 corner combs present in cut-only too
  });

  it('cutOnly OFF (default / empty opts) is byte-identical AND still carries the non-cut layers', () => {
    const { model, params } = ctx({ cornerCombs: true });
    const off = renderRibMasterSheets(model, params);
    expect(off).toEqual(renderRibMasterSheets(model, params, {})); // omitting opts == {}
    // the refactor must NOT drop the other layers on the full path
    expect(off.some((svg) => svg.includes('inkscape:label="FOLD_VALLEY"'))).toBe(true);
    expect(off.some((svg) => svg.includes('inkscape:label="ENGRAVE"'))).toBe(true);
    expect(off.some((svg) => svg.includes('data-role="calibration"'))).toBe(true);
    expect(off.some((svg) => svg.includes('FOLD_MOUNTAIN'))).toBe(true); // combs on -> mountain scores present
  });
});
