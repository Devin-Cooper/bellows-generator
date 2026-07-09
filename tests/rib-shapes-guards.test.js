// tests/rib-shapes-guards.test.js
// Guards for degenerate tapered inputs: a front opening narrower than 2*cornerAllowance would make
// the inset clear width (faceWidth - 2*ca) go NEGATIVE, inverting the rib polygons (CW winding /
// self-overlap) — the "garbled points" failure mode. computeRibShapes must clamp width to >=0 and
// warn instead of emitting inverted geometry.
import { describe, it, expect, vi } from 'vitest';
import { computeRibShapes } from '../src/geometry/ribShapes.js';
import { normalizeParams, DEFAULT_PARAMS } from '../src/params.js';

/** Signed area (shoelace); >=0 means CCW / non-inverted for our polygons. */
function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

describe('computeRibShapes — degenerate front opening guard', () => {
  it('never emits a negative-width rib when front < 2*cornerAllowance', () => {
    const params = normalizeParams({
      ...DEFAULT_PARAMS, type: 'tapered',
      rearW: 200, rearH: 200, frontW: 20, frontH: 20, // 20 < 2*15 -> would go negative
      cornerAllowance: 15,
    });
    const shapes = computeRibShapes(params);
    expect(shapes.every((s) => s.width >= 0)).toBe(true);
  });

  it('never emits an inverted (CW) rib polygon for a steep taper', () => {
    for (const cornerMode of ['clear', 'interlock', 'interlock-full']) {
      const params = normalizeParams({
        ...DEFAULT_PARAMS, type: 'tapered', cornerMode,
        rearW: 200, rearH: 200, frontW: 20, frontH: 20, cornerAllowance: 15,
      });
      const shapes = computeRibShapes(params);
      for (const s of shapes) {
        // area may be ~0 for a clamped-degenerate rib, but must never be negative (inverted)
        expect(signedArea(s.points)).toBeGreaterThanOrEqual(-1e-6);
      }
    }
  });

  it('warns once when a fold width falls below 2*cornerAllowance', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    computeRibShapes(normalizeParams({
      ...DEFAULT_PARAMS, type: 'tapered',
      rearW: 200, rearH: 200, frontW: 20, frontH: 20, cornerAllowance: 15,
    }));
    expect(warn.mock.calls.some((c) => /clear width|cornerAllowance|opening/i.test(String(c[0])))).toBe(true);
    warn.mockRestore();
  });
});

describe('computeRibShapes — interlock-full + taper is unsupported', () => {
  it('warns that interlock-full corners are drawn square on a tapered bellows', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    computeRibShapes(normalizeParams({
      ...DEFAULT_PARAMS, type: 'tapered', cornerMode: 'interlock-full',
      rearW: 200, rearH: 200, frontW: 100, frontH: 100, cornerAllowance: 5,
    }));
    expect(warn.mock.calls.some((c) => /interlock-full/i.test(String(c[0])) && /taper|square/i.test(String(c[0])))).toBe(true);
    warn.mockRestore();
  });

  it('does NOT warn about taper for a straight interlock-full bellows', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    computeRibShapes(normalizeParams({
      ...DEFAULT_PARAMS, type: 'straight', cornerMode: 'interlock-full',
      frontW: 150, frontH: 150, cornerAllowance: 5,
    }));
    expect(warn.mock.calls.some((c) => /taper|square/i.test(String(c[0])))).toBe(false);
    warn.mockRestore();
  });
});
