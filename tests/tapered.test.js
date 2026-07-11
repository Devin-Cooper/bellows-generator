// tests/tapered.test.js
import { describe, it, expect } from 'vitest';
import { computeFaceFoldWidths, buildTaperedPattern } from '../src/geometry/tapered.js';
import { buildPatternModel } from '../src/geometry/index.js';
import { LAYER } from '../src/constants.js';
import { DEFAULT_PARAMS } from '../src/params.js';
import { PHOTRIO_FIXTURES } from './fixtures/photrio.js';

const approx = (a, b) => Math.abs(a - b) < 1e-6;

describe('computeFaceFoldWidths vs Photrio fixtures', () => {
  for (const fx of PHOTRIO_FIXTURES) {
    it(fx.name, () => {
      const { width, height } = computeFaceFoldWidths({ ...DEFAULT_PARAMS, ...fx.params });
      expect(width.length).toBe(fx.width.length);
      expect(height.length).toBe(fx.height.length);
      width.forEach((w, i) => expect(approx(w, fx.width[i])).toBe(true));
      height.forEach((h, i) => expect(approx(h, fx.height[i])).toBe(true));
    });
  }

  it('is a smooth linear rear->front interpolation (no ±step/2 staircase)', () => {
    const { width } = computeFaceFoldWidths({
      ...DEFAULT_PARAMS, type: 'tapered',
      rearW: 200, frontW: 100, rearH: 150, frontH: 80, ribCount: 5,
    });
    const baseline = width.map((_, i) => 200 - (100 / 4) * i);
    // every rib sits exactly on the straight-line baseline (smooth taper, no equal-width pairs)
    width.forEach((w, i) => expect(approx(w, baseline[i])).toBe(true));
    // strictly decreasing (no two adjacent pleats share a width)
    for (let i = 1; i < width.length; i++) expect(width[i]).toBeLessThan(width[i - 1]);
  });
});

const TAPER = {
  ...DEFAULT_PARAMS, type: 'tapered',
  rearW: 200, frontW: 100, rearH: 150, frontH: 80, ribCount: 5,
};

describe('buildTaperedPattern', () => {
  it('produces trapezoid faces with mountain and valley folds', () => {
    const model = buildTaperedPattern(TAPER);
    const types = new Set(model.segments.map((s) => s.type));
    expect(types.has(LAYER.FOLD_MOUNTAIN)).toBe(true);
    expect(types.has(LAYER.FOLD_VALLEY)).toBe(true);
    expect(types.has(LAYER.CUT)).toBe(true);
    const kinds = new Set(model.regions.map((r) => r.kind));
    expect(kinds.has('FACE')).toBe(true);
    expect(kinds.has('CORNER_MITER')).toBe(true);
  });

  it('sizes the flat sheet from the widest (rear) row + glue tab', () => {
    const model = buildTaperedPattern(TAPER);
    // 2*rearW + 2*rearH + glueTab = 400 + 300 + 10
    expect(model.bounds.w).toBeCloseTo(2 * 200 + 2 * 150 + DEFAULT_PARAMS.glueTab, 6);
    expect(model.seamFaceIndex).toBe(4);
    expect(model.metrics.ribCount).toBe(5);
  });

  it('draws proper 45deg corner miters: both M and V, symmetric, reach=min(ca,pitch/2)', () => {
    const model = buildTaperedPattern(TAPER);
    const p = { ...TAPER };
    const pitch = p.rib + p.gap;
    const reach = Math.min(p.cornerAllowance, pitch / 2);
    const isFold = (s) => s.type === LAYER.FOLD_MOUNTAIN || s.type === LAYER.FOLD_VALLEY;
    // corner miters are the SHORT diagonal fold segments: transverse creases are horizontal, and the
    // slanting longitudinal corner folds span the whole pleated length — miters span exactly 2*reach.
    const miters = model.segments.filter(
      (s) =>
        isFold(s) && !s.closed && s.points.length === 2 &&
        Math.abs(s.points[0].y - s.points[1].y) > 1e-6 &&
        Math.abs(s.points[0].y - s.points[1].y) <= pitch + 1e-6
    );
    expect(miters.length).toBeGreaterThan(0);
    // NOT all valley (the old bug hardcoded FOLD_VALLEY)
    expect(miters.some((s) => s.type === LAYER.FOLD_MOUNTAIN)).toBe(true);
    expect(miters.some((s) => s.type === LAYER.FOLD_VALLEY)).toBe(true);
    // each miter is a symmetric 45deg crease: |dx| == |dy| == 2*reach
    for (const s of miters) {
      const dx = Math.abs(s.points[1].x - s.points[0].x);
      const dy = Math.abs(s.points[1].y - s.points[0].y);
      expect(approx(dx, dy)).toBe(true);
      expect(approx(dx, 2 * reach)).toBe(true);
    }
  });

  it('is reached via buildPatternModel type dispatch', () => {
    const model = buildPatternModel(TAPER);
    expect(model.metrics.ribCount).toBe(5);
    // a real taper => at least one FACE region wider than another (not all equal)
    const faceWidths = model.regions.filter((r) => r.kind === 'FACE').map((r) => r.bbox.w);
    expect(Math.max(...faceWidths)).toBeGreaterThan(Math.min(...faceWidths));
  });
});
