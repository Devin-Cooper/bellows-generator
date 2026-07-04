import { describe, it, expect } from 'vitest';
import { computeRibShapes } from '../src/geometry/ribShapes.js';
import { DEFAULT_PARAMS } from '../src/params.js';

const isPointed = (s) => s.points.length > 4;

describe('computeRibShapes cornerMode=alternating (Photrio trapezoidal middle ground)', () => {
  it('a single wall alternates pointed/clear down the draw', () => {
    const shapes = computeRibShapes({ ...DEFAULT_PARAMS, cornerMode: 'alternating' });
    const wall0 = shapes.filter((s) => s.wallIndex === 0).sort((a, b) => a.ribIndex - b.ribIndex);
    expect(wall0.length).toBeGreaterThan(1);
    for (let i = 1; i < wall0.length; i++) {
      expect(isPointed(wall0[i])).toBe(!isPointed(wall0[i - 1]));
    }
  });

  it('adjacent walls at the same pleat carry opposite treatment', () => {
    const shapes = computeRibShapes({ ...DEFAULT_PARAMS, cornerMode: 'alternating' });
    const rib0 = shapes.filter((s) => s.ribIndex === 0).sort((a, b) => a.wallIndex - b.wallIndex);
    expect(rib0.length).toBe(4);
    for (let i = 1; i < rib0.length; i++) {
      expect(isPointed(rib0[i])).toBe(!isPointed(rib0[i - 1]));
    }
  });

  it('roughly half the ribs point -> thin corner pack, not ~2x bulk', () => {
    const shapes = computeRibShapes({ ...DEFAULT_PARAMS, cornerMode: 'alternating' });
    const pointed = shapes.filter(isPointed).length;
    expect(pointed).toBeGreaterThan(0);
    expect(pointed).toBeLessThan(shapes.length);
  });
});
