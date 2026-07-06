import { describe, it, expect } from 'vitest';
import { computeCornerCombs, COMB_SPINE_WIDTH } from '../src/geometry/cornerCombs.js';
import { computeMetrics } from '../src/geometry/metrics.js';
import { normalizeParams, DEFAULT_PARAMS } from '../src/params.js';
import { LAYER } from '../src/constants.js';

const P = (o = {}) => normalizeParams({ ...DEFAULT_PARAMS, cornerCombs: true, ...o });

describe('computeCornerCombs', () => {
  it('returns [] when cornerCombs is off', () => {
    expect(computeCornerCombs(normalizeParams({ ...DEFAULT_PARAMS, cornerCombs: false }))).toEqual([]);
  });

  it('returns 4 combs when on', () => {
    expect(computeCornerCombs(P()).length).toBe(4);
  });

  it('each comb has ribCount teeth spanning [0, 2*ca] with width == combToothWidth', () => {
    const params = P();
    const ca = params.cornerAllowance;
    const { ribCount } = computeMetrics(params);
    for (const comb of computeCornerCombs(params)) {
      expect(comb.teeth.length).toBe(ribCount);
      for (const t of comb.teeth) {
        expect(t.x0).toBeCloseTo(0, 6);
        expect(t.x1).toBeCloseTo(2 * ca, 6);
        expect(t.y1 - t.y0).toBeCloseTo(params.combToothWidth, 6);
      }
    }
  });

  it('teeth are centered per facet at rib pitch and stay inside the rib zone', () => {
    const params = P();
    const { pitch } = computeMetrics(params);
    const rib = params.rib;
    const comb = computeCornerCombs(params)[0];
    comb.teeth.forEach((t, r) => {
      const center = (t.y0 + t.y1) / 2;
      expect(center).toBeCloseTo(r * pitch + rib / 2, 6);
      expect(t.y0).toBeGreaterThanOrEqual(r * pitch - 1e-6);       // inside rib facet [r*pitch, r*pitch+rib]
      expect(t.y1).toBeLessThanOrEqual(r * pitch + rib + 1e-6);
    });
  });

  it('has exactly one longitudinal MOUNTAIN corner score at x = ca, full length', () => {
    const params = P();
    const ca = params.cornerAllowance;
    const { flatPleatedLength } = computeMetrics(params);
    const comb = computeCornerCombs(params)[0];
    const longs = comb.scores.filter((s) => s.points[0].x === s.points[1].x);
    expect(longs.length).toBe(1);
    expect(longs[0].type).toBe(LAYER.FOLD_MOUNTAIN);
    expect(longs[0].points[0].x).toBeCloseTo(ca, 6);
    expect(longs[0].points[0].y).toBeCloseTo(0, 6);
    expect(longs[0].points[1].y).toBeCloseTo(flatPleatedLength, 6);
  });

  it('has N transverse scores at the crease positions, confined to the spine, M/V by (i+f) parity', () => {
    const params = P();
    const ca = params.cornerAllowance;
    const rib = params.rib;
    const gap = params.gap;
    const { N, pitch } = computeMetrics(params);
    const comb = computeCornerCombs(params)[0];
    const trans = comb.scores.filter((s) => s.points[0].y === s.points[1].y);
    expect(trans.length).toBe(N);
    trans.forEach((s, i) => {
      expect(s.points[0].y).toBeCloseTo(rib + i * pitch + gap / 2, 6);
      // confined to the spine x-band [ca - S/2, ca + S/2]
      expect(Math.min(s.points[0].x, s.points[1].x)).toBeCloseTo(ca - COMB_SPINE_WIDTH / 2, 6);
      expect(Math.max(s.points[0].x, s.points[1].x)).toBeCloseTo(ca + COMB_SPINE_WIDTH / 2, 6);
      const mountain = ((i + comb.f) % 2) === 0;
      expect(s.type).toBe(mountain ? LAYER.FOLD_MOUNTAIN : LAYER.FOLD_VALLEY);
    });
  });

  it('bbox is 2*ca wide and flatPleatedLength tall; outline is a closed non-empty polygon', () => {
    const params = P();
    const ca = params.cornerAllowance;
    const { flatPleatedLength } = computeMetrics(params);
    const comb = computeCornerCombs(params)[0];
    expect(comb.bbox.w).toBeCloseTo(2 * ca, 6);
    expect(comb.bbox.h).toBeCloseTo(flatPleatedLength, 6);
    expect(comb.outline.length).toBeGreaterThan(8);
    const xs = comb.outline.map((p) => p.x);
    const ys = comb.outline.map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(0, 6);
    expect(Math.max(...xs)).toBeCloseTo(2 * ca, 6);
    expect(Math.min(...ys)).toBeCloseTo(0, 6);
    expect(Math.max(...ys)).toBeCloseTo(flatPleatedLength, 6);
  });

  it('the 4 combs carry distinct corner indices and labels; combToothWidth==rib fills the facet', () => {
    const combs = computeCornerCombs(P({ combToothWidth: 999 })); // clamped to rib
    expect(combs.map((c) => c.cornerIndex).sort()).toEqual([0, 1, 2, 3]);
    expect(new Set(combs.map((c) => c.label)).size).toBe(4);
    expect(combs[0].teeth[0].y1 - combs[0].teeth[0].y0).toBeCloseTo(12, 6); // rib default 12
  });
});
