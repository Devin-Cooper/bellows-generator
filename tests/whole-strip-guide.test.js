// tests/whole-strip-guide.test.js
import { describe, it, expect } from 'vitest';
import { buildStraightPattern, WHOLE_STRIP_NOTE } from '../src/geometry/straight.js';
import { buildTaperedPattern } from '../src/geometry/tapered.js';
import { computeRibShapes } from '../src/geometry/ribShapes.js';
import { normalizeParams, DEFAULT_PARAMS } from '../src/params.js';
import { LAYER } from '../src/constants.js';

const engraves = (m) => m.segments.filter((s) => s.type === LAYER.ENGRAVE);
const widthOf = (s) => {
  const xs = s.points.map((p) => p.x);
  return Math.max(...xs) - Math.min(...xs);
};
const round2 = (x) => Math.round(x * 100) / 100;

// A6 (rectangular) so half-W (65) is distinct from full W (130) and full H (85).
const A6 = normalizeParams({ ...DEFAULT_PARAMS, frontW: 160, frontH: 115 });
// PHOTRIO_TAPERED geometry — matches tests/footprints-engine.test.js.
const TAPER = normalizeParams({
  ...DEFAULT_PARAMS,
  type: 'tapered',
  rearW: 200,
  frontW: 100,
  rearH: 150,
  frontH: 80,
  ribCount: 5,
});

describe('whole-strip fabric guide annotation (split-W half-marks)', () => {
  it('exports a stable, human-readable annotation string', () => {
    expect(typeof WHOLE_STRIP_NOTE).toBe('string');
    expect(WHOLE_STRIP_NOTE).toMatch(/whole strip/i);
    expect(WHOLE_STRIP_NOTE).toMatch(/rib ladder/i);
  });

  it('straight: every split-W half-mark carries the whole-strip annotation; full faces do not', () => {
    const model = buildStraightPattern(A6);
    const ribCount = model.metrics.ribCount;
    const marks = engraves(model);
    const annotated = marks.filter((s) => s.annotation === WHOLE_STRIP_NOTE);
    const plain = marks.filter((s) => s.annotation === undefined);

    // Columns 0 & 4 are the two split-W halves: ribCount ribs each => 2*ribCount half-marks.
    expect(annotated.length).toBe(2 * ribCount);
    expect(plain.length).toBe(marks.length - 2 * ribCount);

    // Each annotated mark is a HALF-W footprint (width == engine width/2), proving it is a
    // split-W half and not a full face — the whole-strip note lands only on the halves.
    const wShape = computeRibShapes(A6).find((s) => s.face === 'W');
    for (const s of annotated) {
      expect(round2(widthOf(s))).toBe(round2(wShape.width / 2)); // 65 == 130/2
    }
    // No full-face mark carries the note.
    for (const s of plain) expect(s.annotation).toBeUndefined();
  });

  it('tapered: the two split-W half columns (0 & 4) carry the annotation; interior faces do not', () => {
    const model = buildTaperedPattern(TAPER);
    const ribCount = model.metrics.ribCount;
    const marks = engraves(model);
    const annotated = marks.filter((s) => s.annotation === WHOLE_STRIP_NOTE);
    const plain = marks.filter((s) => s.annotation === undefined);
    expect(annotated.length).toBe(2 * ribCount); // 2 half columns x ribCount
    expect(plain.length).toBe(3 * ribCount);     // 3 interior columns x ribCount
  });

  it('the annotation is metadata only — footprint geometry is unchanged (still closed polygons)', () => {
    for (const s of engraves(buildStraightPattern(A6))) {
      expect(s.type).toBe(LAYER.ENGRAVE);
      expect(s.closed).toBe(true);
      expect(s.points.length).toBeGreaterThanOrEqual(4);
    }
  });
});
