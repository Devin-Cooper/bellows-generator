import { describe, it, expect } from 'vitest';
import { renderRibMasterSheets } from '../src/render/svg.js';
import { computeMetrics } from '../src/geometry/metrics.js';
import { normalizeParams, DEFAULT_PARAMS } from '../src/params.js';

function ctx(o = {}) {
  const params = normalizeParams({ ...DEFAULT_PARAMS, ...o });
  return { params, model: { metrics: computeMetrics(params) } };
}
function attrsByRole(svg, role) {
  const out = [];
  const re = /<(?:path|line|text) ([^>]*?)\/?>/g;
  let m;
  while ((m = re.exec(svg)) !== null) {
    const a = {};
    const are = /([\w-]+)="([^"]*)"/g;
    let x;
    while ((x = are.exec(m[1])) !== null) a[x[1]] = x[2];
    if (a['data-role'] === role) out.push(a);
  }
  return out;
}
const roleAcross = (sheets, role) => sheets.flatMap((s) => attrsByRole(s, role));
function bboxOfD(d) {
  const n = d.replace(/[MLZ]/g, ' ').trim().match(/-?[\d.]+/g).map(Number);
  const xs = [], ys = [];
  for (let i = 0; i < n.length; i += 2) { xs.push(n[i]); ys.push(n[i + 1]); }
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

describe('corner combs on the master sheets', () => {
  it('OFF (default): no comb artifacts and no FOLD_MOUNTAIN layer group', () => {
    const { model, params } = ctx({ cornerCombs: false });
    const sheets = renderRibMasterSheets(model, params);
    expect(roleAcross(sheets, 'comb').length).toBe(0);
    expect(roleAcross(sheets, 'comb-score').length).toBe(0);
    for (const svg of sheets) expect(svg).not.toContain('FOLD_MOUNTAIN');
  });

  it('combs are purely additive: rib ladder paths are byte-identical ON vs OFF', () => {
    const ladderDs = (o) => {
      const { model, params } = ctx(o);
      return roleAcross(renderRibMasterSheets(model, params), 'ladder').map((a) => a.d);
    };
    // ribs are packed before combs, so appending comb blocks never moves a rib block.
    expect(ladderDs({ cornerCombs: true })).toEqual(ladderDs({ cornerCombs: false }));
  });

  it('ON: exactly 4 comb outlines with labels, plus M/V comb scores', () => {
    const { model, params } = ctx({ cornerCombs: true });
    const sheets = renderRibMasterSheets(model, params);
    expect(roleAcross(sheets, 'comb').length).toBe(4);
    expect(roleAcross(sheets, 'comb-label').length).toBe(4);
    expect(roleAcross(sheets, 'comb-score').length).toBeGreaterThan(0);
    // a FOLD_MOUNTAIN group now exists on at least one sheet
    expect(sheets.some((svg) => svg.includes('FOLD_MOUNTAIN'))).toBe(true);
  });

  it('ON: every comb outline stays within the bed bounds [0,bedW] x [0,bedH]', () => {
    const { model, params } = ctx({ cornerCombs: true });
    const sheets = renderRibMasterSheets(model, params);
    for (const c of roleAcross(sheets, 'comb')) {
      const b = bboxOfD(c.d);
      expect(b.minX).toBeGreaterThanOrEqual(-1e-6);
      expect(b.maxX).toBeLessThanOrEqual(params.bedW + 1e-6);
      expect(b.minY).toBeGreaterThanOrEqual(-1e-6);
      expect(b.maxY).toBeLessThanOrEqual(params.bedH + 1e-6);
    }
  });
});
