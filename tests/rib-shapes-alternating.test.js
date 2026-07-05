import { describe, it, expect } from 'vitest';
import { computeRibShapes } from '../src/geometry/ribShapes.js';
import { DEFAULT_PARAMS } from '../src/params.js';

// The old 'alternating' mode is REMOVED and migrated to 'interlock'. Interlock keeps the
// alternation idea but pairs it with a complementary notch: adjacent walls at the same band
// carry OPPOSITE roles (one points, one is set back) so the ring nests corner-to-corner.
const isWide = (s) => s.points.some((p) => p.x > s.width || p.x < 0);
const isNarrow = (s) => s.points.some((p) => p.x > 0 && p.x < s.width);

describe('computeRibShapes cornerMode=interlock — wide/narrow alternation', () => {
  it('every interlock rib is either wide (point) or narrow (notch) — exactly one role, never plain', () => {
    const shapes = computeRibShapes({ ...DEFAULT_PARAMS, cornerMode: 'interlock' });
    for (const s of shapes) {
      expect(isWide(s) !== isNarrow(s)).toBe(true);
    }
  });

  it('adjacent walls at the same pleat carry opposite treatment (point vs notch)', () => {
    const shapes = computeRibShapes({ ...DEFAULT_PARAMS, cornerMode: 'interlock' });
    const rib0 = shapes.filter((s) => s.ribIndex === 0).sort((a, b) => a.wallIndex - b.wallIndex);
    expect(rib0.length).toBe(4);
    for (let i = 1; i < rib0.length; i++) {
      expect(isWide(rib0[i])).toBe(!isWide(rib0[i - 1]));
    }
  });

  it('roughly half the ribs point and half are set back (balanced corner pack, no plain ribs)', () => {
    const shapes = computeRibShapes({ ...DEFAULT_PARAMS, cornerMode: 'interlock' });
    const wide = shapes.filter(isWide).length;
    const narrow = shapes.filter(isNarrow).length;
    expect(wide).toBeGreaterThan(0);
    expect(narrow).toBeGreaterThan(0);
    expect(wide + narrow).toBe(shapes.length);
  });
});
