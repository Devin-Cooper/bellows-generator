// tests/pattern-miter.test.js
import { describe, it, expect } from 'vitest';
import { buildPatternModel } from '../src/geometry/index.js';
import { DEFAULT_PARAMS } from '../src/params.js';
import { LAYER } from '../src/constants.js';

// A6 is a genuinely rectangular tube (W != H) so all four corners exercise the
// (i + c) tilt parity — a square would hide the P7 backwards-at-2-of-4 bug.
const A6 = { ...DEFAULT_PARAMS, frontW: 160, frontH: 115 };

const isFold = (s) => s.type === LAYER.FOLD_MOUNTAIN || s.type === LAYER.FOLD_VALLEY;
// Corner-miter diagonals are the only FOLD segments that move in BOTH x and y
// (longitudinal corner folds are vertical, transverse folds horizontal).
const diagonals = (model) =>
  model.segments.filter(
    (s) =>
      isFold(s) &&
      s.points.length === 2 &&
      s.points[0].x !== s.points[1].x &&
      s.points[0].y !== s.points[1].y
  );

describe('straight corner-miter reach (P6)', () => {
  it('emits one diagonal per pleat per corner', () => {
    const model = buildPatternModel({ ...A6 });
    expect(diagonals(model).length).toBe(4 * model.metrics.N);
  });

  it('every diagonal rise <= pleat pitch (does not overrun the pitch)', () => {
    const model = buildPatternModel({ ...A6 });
    const pitch = model.metrics.pitch; // rib + gap = 14.5
    for (const s of diagonals(model)) {
      const rise = Math.abs(s.points[1].y - s.points[0].y);
      expect(rise).toBeLessThanOrEqual(pitch + 1e-9);
    }
  });

  it('stays a true 45-degree crease (|dx| == |dy|) inside the clear zone', () => {
    const model = buildPatternModel({ ...A6 });
    const ca = A6.cornerAllowance; // 15
    for (const s of diagonals(model)) {
      const dx = Math.abs(s.points[1].x - s.points[0].x);
      const dy = Math.abs(s.points[1].y - s.points[0].y);
      expect(Math.abs(dx - dy)).toBeLessThan(1e-9); // 45 degrees
      expect(dx / 2).toBeLessThanOrEqual(ca + 1e-9); // half-reach within corner allowance
    }
  });

  it('clamps half-reach to cornerAllowance when ca < pitch/2 (exercises the ca branch)', () => {
    // reach = min(ca, pitch/2); pitch/2 = 7.25, so ca=5 selects the ca term (the ca<pitch/2
    // branch the ca=15 cases never hit). Pins that small-ca users' crease stays inside the
    // corner-allowance zone.
    const model = buildPatternModel({ ...A6, cornerAllowance: 5 });
    const ds = diagonals(model);
    expect(ds.length).toBeGreaterThan(0);
    for (const s of ds) {
      const halfReach = Math.abs(s.points[1].x - s.points[0].x) / 2;
      expect(halfReach).toBeCloseTo(5, 9); // clamps to ca (5), NOT pitch/2 (7.25)
    }
  });
});

describe('straight corner-miter tilt (P7)', () => {
  it('tilt sense follows (ribIndex + cornerIndex): mountain rises, valley falls', () => {
    const model = buildPatternModel({ ...A6 });
    for (const s of diagonals(model)) {
      const [a, b] =
        s.points[0].x < s.points[1].x ? [s.points[0], s.points[1]] : [s.points[1], s.points[0]];
      const slope = b.y - a.y; // going left -> right
      if (s.type === LAYER.FOLD_MOUNTAIN) expect(slope).toBeGreaterThan(0);
      else expect(slope).toBeLessThan(0);
    }
  });

  it('absolute (i+c) parity: c=0,i=0 is MOUNTAIN; each diagonal matches ((i+c)%2===0)', () => {
    const model = buildPatternModel({ ...A6 });
    const ds = diagonals(model);
    const { pitch: p } = model.metrics;
    const { endMargin, rib, gap } = A6;

    // Recover the 4 corner x-positions from diagonal midpoints; ascending sort gives rank = c.
    const cornerXs = [...new Set(ds.map((s) => (s.points[0].x + s.points[1].x) / 2))].sort(
      (a, b) => a - b
    );
    expect(cornerXs).toHaveLength(4);

    // Absolute anchor: the diagonal at c=0, i=0 MUST be FOLD_MOUNTAIN.
    // A global-flip mutation ((i+c+1)%2) or a dropped-corner mutation ((i)%2) would invert this.
    const anchor = ds.find((s) => {
      const midX = (s.points[0].x + s.points[1].x) / 2;
      const midY = (s.points[0].y + s.points[1].y) / 2;
      const c = cornerXs.indexOf(midX);
      const i = Math.round((midY - endMargin - rib - gap / 2) / p);
      return c === 0 && i === 0;
    });
    expect(anchor).toBeDefined();
    expect(anchor.type).toBe(LAYER.FOLD_MOUNTAIN);

    // Every diagonal: independently compute expected type from (i+c) parity and compare.
    for (const s of ds) {
      const midX = (s.points[0].x + s.points[1].x) / 2;
      const midY = (s.points[0].y + s.points[1].y) / 2;
      const c = cornerXs.indexOf(midX);
      const i = Math.round((midY - endMargin - rib - gap / 2) / p);
      const expected = (i + c) % 2 === 0 ? LAYER.FOLD_MOUNTAIN : LAYER.FOLD_VALLEY;
      expect(s.type, `diagonal c=${c} i=${i}: expected ${expected}`).toBe(expected);
    }
  });
});
