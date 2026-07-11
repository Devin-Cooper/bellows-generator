// tests/pattern-straight.test.js
import { describe, it, expect } from 'vitest';
import { buildPatternModel } from '../src/geometry/index.js';
import { DEFAULT_PARAMS } from '../src/params.js';
import { LAYER } from '../src/constants.js';

// Pin the pre-v0.2.1 corner allowance: these fold/rib-span assertions were written for the 15mm
// regime, independent of the (now small) default.
const A6 = { ...DEFAULT_PARAMS, frontW: 160, frontH: 115, cornerAllowance: 15 };

const approx = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

describe('buildPatternModel (straight)', () => {
  it('carries the default metrics (ribCount 25)', () => {
    const model = buildPatternModel({ ...DEFAULT_PARAMS });
    expect(model.metrics.ribCount).toBe(25);
    expect(model.metrics.N).toBe(24);
  });

  it('flat width = 2(W+H) + glueTab', () => {
    const model = buildPatternModel({ ...A6 });
    expect(model.bounds.w).toBe(2 * (160 + 115) + 10); // 560
  });

  it('places the seam mid-wall, not on a tube corner', () => {
    const model = buildPatternModel({ ...A6 });
    // Longitudinal corner folds are vertical FOLD segments (constant x, two points).
    const cornerX = model.segments
      .filter((s) => (s.type === LAYER.FOLD_MOUNTAIN || s.type === LAYER.FOLD_VALLEY)
        && s.points.length === 2 && s.points[0].x === s.points[1].x)
      .map((s) => s.points[0].x);
    const uniqueCornerX = [...new Set(cornerX)];
    expect(uniqueCornerX.sort((a, b) => a - b)).toEqual([80, 195, 355, 470]);
    // Seam is at x=0 (mid of the split W wall) and must not sit on any corner.
    expect(uniqueCornerX).not.toContain(0);
    expect(model.seamFaceIndex).toBe(0);
    expect(model.regions[Math.max(0, model.regions.findIndex((r) => r.faceIndex === 0 && (r.kind === 'HALF_FACE' || r.kind === 'FACE')))].kind).toBe('HALF_FACE');
  });

  it('inverts M/V phase across adjacent faces at a shared pleat', () => {
    const model = buildPatternModel({ ...A6 });
    // First gap center along the draw.
    const y0 = 35 + 12 + 2.5 / 2; // endMargin + rib + gap/2 = 48.25
    // Transverse folds are horizontal (constant y). Face 1 (H) zone starts at x=95; face 2 (W) at x=210.
    const foldAt = (xStart) => model.segments.find((s) =>
      (s.type === LAYER.FOLD_MOUNTAIN || s.type === LAYER.FOLD_VALLEY)
      && s.points.length === 2 && approx(s.points[0].y, y0) && approx(s.points[1].y, y0)
      && approx(Math.min(s.points[0].x, s.points[1].x), xStart));
    const face1 = foldAt(95);
    const face2 = foldAt(210);
    expect(face1).toBeDefined();
    expect(face2).toBeDefined();
    expect(face1.type).not.toBe(face2.type); // cross-face inversion
  });

  it('alternates M/V along the draw on a single face', () => {
    const model = buildPatternModel({ ...A6 });
    const y0 = 35 + 12 + 2.5 / 2;      // pleat 0 center
    const y1 = 35 + 12 + 14.5 + 2.5 / 2; // pleat 1 center
    const foldAt = (y) => model.segments.find((s) =>
      (s.type === LAYER.FOLD_MOUNTAIN || s.type === LAYER.FOLD_VALLEY)
      && s.points.length === 2 && approx(s.points[0].y, y) && approx(s.points[1].y, y)
      && approx(Math.min(s.points[0].x, s.points[1].x), 210)); // face 2 (W)
    expect(foldAt(y0).type).not.toBe(foldAt(y1).type);
  });

  it('rib span = faceDim - 2*cornerAllowance on full faces', () => {
    const model = buildPatternModel({ ...A6 });
    const widths = new Set(
      model.segments
        .filter((s) => s.type === LAYER.ENGRAVE && s.points.length === 4)
        .map((s) => {
          const xs = s.points.map((p) => p.x);
          return Math.round((Math.max(...xs) - Math.min(...xs)) * 100) / 100;
        })
    );
    expect(widths.has(160 - 2 * 15)).toBe(true); // W face: 130
    expect(widths.has(115 - 2 * 15)).toBe(true); // H face: 85
  });

  it('emits one 45-degree corner miter per pleat per corner', () => {
    const model = buildPatternModel({ ...A6 });
    const miters = model.regions.filter((r) => r.kind === 'CORNER_MITER');
    expect(miters.length).toBe(4 * model.metrics.N); // 4 corners * N pleats
  });
});
