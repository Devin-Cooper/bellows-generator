import { describe, it, expect } from 'vitest';
import { computeRibShapes } from '../src/geometry/ribShapes.js';
import { DEFAULT_PARAMS } from '../src/params.js';

// The old 'alternating' mode is REMOVED and migrated to 'interlock'. Interlock keeps the
// alternation idea but as a TRAPEZOID orientation flip: adjacent walls at the same band (and
// consecutive ribs on one wall) carry OPPOSITE orientation ('leading' vs 'rear') so their
// half-diagonals meet on the shared fold line and nest corner-to-corner.
const depthOf = (s) => s.yBand.y1 - s.yBand.y0;
const isTrapezoid = (s) => s.points.some((p) => p.x < -1e-9 || p.x > s.width + 1e-9);
const orientationOf = (s) => {
  const y0min = Math.min(...s.points.filter((p) => Math.abs(p.y) < 1e-6).map((p) => p.x));
  return y0min < -1e-6 ? 'leading' : 'rear';
};

describe('computeRibShapes cornerMode=interlock — orientation alternation', () => {
  it('every interlock rib is a trapezoid (projects a half-point) with a definite orientation', () => {
    const shapes = computeRibShapes({ ...DEFAULT_PARAMS, cornerMode: 'interlock' });
    for (const s of shapes) {
      expect(isTrapezoid(s)).toBe(true);
      expect(['leading', 'rear']).toContain(orientationOf(s));
    }
  });

  it('adjacent walls at the same pleat carry opposite orientation (leading vs rear)', () => {
    const shapes = computeRibShapes({ ...DEFAULT_PARAMS, cornerMode: 'interlock' });
    const rib0 = shapes.filter((s) => s.ribIndex === 0).sort((a, b) => a.wallIndex - b.wallIndex);
    expect(rib0.length).toBe(4);
    for (let i = 1; i < rib0.length; i++) {
      expect(orientationOf(rib0[i])).not.toBe(orientationOf(rib0[i - 1]));
    }
  });

  it('a single wall alternates orientation down the draw (no plain ribs)', () => {
    const shapes = computeRibShapes({ ...DEFAULT_PARAMS, cornerMode: 'interlock' });
    const wall0 = shapes.filter((s) => s.wallIndex === 0).sort((a, b) => a.ribIndex - b.ribIndex);
    expect(wall0.length).toBeGreaterThan(1);
    for (let i = 1; i < wall0.length; i++) {
      expect(orientationOf(wall0[i])).toBe(orientationOf(wall0[i - 1]) === 'leading' ? 'rear' : 'leading');
    }
    // roughly balanced across the whole ring: both orientations appear
    const lead = shapes.filter((s) => orientationOf(s) === 'leading').length;
    const rear = shapes.filter((s) => orientationOf(s) === 'rear').length;
    expect(lead).toBeGreaterThan(0);
    expect(rear).toBeGreaterThan(0);
    expect(lead + rear).toBe(shapes.length);
  });
});
