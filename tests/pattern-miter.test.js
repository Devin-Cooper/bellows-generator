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
});
