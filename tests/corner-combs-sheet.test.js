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
// Each comb path with its wrapping transform (rotated blocks emit BLOCK-LOCAL coords + a
// translate(tx,ty) rotate(90) group, so the raw `d` alone is NOT the on-sheet position).
function combPlacements(sheets) {
  const out = [];
  const re = /(?:<g transform="translate\(([-\d.]+), ([-\d.]+)\) rotate\(90\)">\s*)?<path data-role="comb"[^>]*?d="([^"]+)"/g;
  for (const svg of sheets) {
    let m;
    while ((m = re.exec(svg)) !== null) {
      out.push({ rotated: m[1] !== undefined, tx: Number(m[1] || 0), ty: Number(m[2] || 0), d: m[3] });
    }
  }
  return out;
}
// The comb's ACTUAL bed-frame bbox: raw for un-rotated; for rotated, apply translate(tx,ty)
// rotate(90) — SVG rotate(90) is CW so (x,y) -> (tx - y, ty + x).
function placedBbox(p) {
  const b = bboxOfD(p.d);
  if (!p.rotated) return b;
  const X = [p.tx - b.maxY, p.tx - b.minY];
  const Y = [p.ty + b.minX, p.ty + b.maxX];
  return { minX: Math.min(...X), maxX: Math.max(...X), minY: Math.min(...Y), maxY: Math.max(...Y) };
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

  it('ON: every comb\'s ACTUAL (transform-applied) placement stays within the bed bounds', () => {
    // Default params rotate the combs (comb length 360mm > usable bed height), so this exercises the
    // rotate(90)+translate path — the raw `d` is block-local and must be transformed to the bed frame.
    const { model, params } = ctx({ cornerCombs: true });
    const sheets = renderRibMasterSheets(model, params);
    const placements = combPlacements(sheets);
    expect(placements.length).toBe(4);
    expect(placements.some((p) => p.rotated)).toBe(true); // the rotated placement path is covered
    for (const p of placements) {
      const b = placedBbox(p);
      expect(b.minX).toBeGreaterThanOrEqual(-1e-6);
      expect(b.maxX).toBeLessThanOrEqual(params.bedW + 1e-6);
      expect(b.minY).toBeGreaterThanOrEqual(-1e-6);
      expect(b.maxY).toBeLessThanOrEqual(params.bedH + 1e-6);
    }
  });
});
