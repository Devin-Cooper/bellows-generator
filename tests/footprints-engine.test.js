// tests/footprints-engine.test.js
import { describe, it, expect } from 'vitest';
import { buildStraightPattern } from '../src/geometry/straight.js';
import { buildTaperedPattern } from '../src/geometry/tapered.js';
import { computeRibShapes } from '../src/geometry/ribShapes.js';
import { normalizeParams, DEFAULT_PARAMS } from '../src/params.js';
import { LAYER } from '../src/constants.js';

const round2 = (x) => Math.round(x * 100) / 100;
const engraves = (m) => m.segments.filter((s) => s.type === LAYER.ENGRAVE);
const widthOf = (s) => {
  const xs = s.points.map((p) => p.x);
  return Math.max(...xs) - Math.min(...xs);
};
const y0Of = (s) => Math.min(...s.points.map((p) => p.y));

const A6 = normalizeParams({ ...DEFAULT_PARAMS, frontW: 160, frontH: 115 });
// PHOTRIO_TAPERED_A geometry: wFold = [200,162.5,162.5,112.5,100] rear->front.
const TAPER = normalizeParams({
  ...DEFAULT_PARAMS,
  type: 'tapered',
  rearW: 200,
  frontW: 100,
  rearH: 150,
  frontH: 80,
  ribCount: 5,
});

describe('straight footprints re-derived from computeRibShapes', () => {
  it('every footprint is a closed 4-point rectangle', () => {
    for (const s of engraves(buildStraightPattern(A6))) {
      expect(s.closed).toBe(true);
      expect(s.points.length).toBe(4);
    }
  });

  it('full-face widths == engine width; half-face widths == engine width/2', () => {
    const model = buildStraightPattern(A6);
    const shapes = computeRibShapes(A6);
    const wShape = shapes.find((s) => s.face === 'W');
    const hShape = shapes.find((s) => s.face === 'H');
    const widths = new Set(engraves(model).map((s) => round2(widthOf(s))));
    expect(widths.has(round2(wShape.width))).toBe(true); // 130 full W
    expect(widths.has(round2(hShape.width))).toBe(true); // 85 full H
    expect(widths.has(round2(wShape.width / 2))).toBe(true); // 65 half W (split wall)
  });

  it('footprint y-band sits on the fabric endMargin datum (shared with the ladder)', () => {
    const model = buildStraightPattern(A6);
    const pitch = model.metrics.pitch;
    const y0s = new Set(engraves(model).map((s) => round2(y0Of(s))));
    expect(y0s.has(round2(A6.endMargin))).toBe(true); // rib 0 at endMargin
    expect(y0s.has(round2(A6.endMargin + pitch))).toBe(true); // rib 1 at endMargin + pitch
  });
});

describe('tapered footprints re-derived from computeRibShapes (P3b)', () => {
  it('are CLOSED inset rectangles, not open centreline ticks', () => {
    const marks = engraves(buildTaperedPattern(TAPER));
    expect(marks.length).toBeGreaterThan(0);
    for (const s of marks) {
      expect(s.closed).toBe(true);
      expect(s.points.length).toBe(4);
    }
  });

  it('interior widths == per-pleat engine width (inset), never the full un-inset fold', () => {
    const model = buildTaperedPattern(TAPER);
    const wWidths = new Set(
      computeRibShapes(TAPER)
        .filter((s) => s.face === 'W')
        .map((s) => round2(s.width))
    ); // {170,132.5,82.5,70} = wFold - 2*ca
    const widths = engraves(model).map((s) => round2(widthOf(s)));
    // Universal: EVERY per-pleat engine width must appear among the rendered footprints,
    // so a no-taper regression (all ribs one constant width) can't slip through.
    const near = (target) => widths.some((w) => Math.abs(w - target) <= 1e-6);
    for (const w of wWidths) expect(near(w)).toBe(true); // {170,132.5,82.5,70} all present
    expect(widths.some((w) => w === 200)).toBe(false); // no un-inset full-fold tick
  });
});
