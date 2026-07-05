import { describe, it, expect } from 'vitest';
import { buildStraightPattern } from '../src/geometry/straight.js';
import { buildTaperedPattern } from '../src/geometry/tapered.js';
import { renderRibLadderSVG } from '../src/render/svg.js';
import { exportRibsSTL } from '../src/export/stl.js';
import { normalizeParams, DEFAULT_PARAMS } from '../src/params.js';

// The CORRECTED interlock rib is a convex TRAPEZOID with the SAME vertex count (4) as a clear
// rectangle, so propagation no longer shows up as "more vertices" — it shows up as a DIFFERENT
// shape: the trapezoid's four x-values differ from the rectangle's two rails. Each consumer must
// reflect that shape change (footprints, ladder outline, STL geometry).
const engrave = (model) => model.segments.filter((s) => s.layer === 'ENGRAVE');
const distinctXs = (seg) => new Set(seg.points.map((p) => Math.round(p.x * 1e4) / 1e4)).size;
const maxDistinctX = (model) => Math.max(...engrave(model).map(distinctXs));

describe('cornerMode=interlock propagates from computeRibShapes to every consumer', () => {
  it('straight fabric footprints become trapezoids in interlock mode (2 rail x-values -> >2)', () => {
    const clear = buildStraightPattern(normalizeParams({ ...DEFAULT_PARAMS, cornerMode: 'clear' }));
    const inter = buildStraightPattern(normalizeParams({ ...DEFAULT_PARAMS, cornerMode: 'interlock' }));
    expect(maxDistinctX(clear)).toBe(2);        // rectangles: two rail x's
    expect(maxDistinctX(inter)).toBeGreaterThan(2); // trapezoids: reach + setback x's
  });

  it('tapered fabric footprints become trapezoids in interlock mode', () => {
    const b = { ...DEFAULT_PARAMS, type: 'tapered', rearW: 200, rearH: 160, frontW: 120, frontH: 90 };
    expect(maxDistinctX(buildTaperedPattern(normalizeParams({ ...b, cornerMode: 'clear' })))).toBe(2);
    expect(maxDistinctX(buildTaperedPattern(normalizeParams({ ...b, cornerMode: 'interlock' })))).toBeGreaterThan(2);
  });

  it('rib-ladder SVG cut outline reflects the interlock trapezoid ends (differs from clear; more distinct rail x)', () => {
    const clearP = normalizeParams({ ...DEFAULT_PARAMS, cornerMode: 'clear' });
    const interP = normalizeParams({ ...DEFAULT_PARAMS, cornerMode: 'interlock' });
    const clearSvg = renderRibLadderSVG(buildStraightPattern(clearP), clearP);
    const interSvg = renderRibLadderSVG(buildStraightPattern(interP), interP);
    expect(interSvg).not.toBe(clearSvg);
    // distinct x-values across the ladder cut paths: the diagonals introduce reach/setback x's
    const ladderXs = (svg) => {
      const ds = [...svg.matchAll(/<path data-role="ladder"[^>]*\bd="([^"]*)"/g)].map((m) => m[1]).join(' ');
      const set = new Set();
      for (const t of ds.matchAll(/[ML] (-?[\d.]+) /g)) set.add(t[1]);
      return set.size;
    };
    expect(ladderXs(interSvg)).toBeGreaterThan(ladderXs(clearSvg));
  });

  it('STL geometry reflects interlock ends: same triangle count (4-vertex ribs) but different vertex data', () => {
    const clearP = normalizeParams({ ...DEFAULT_PARAMS, cornerMode: 'clear' });
    const interP = normalizeParams({ ...DEFAULT_PARAMS, cornerMode: 'interlock' });
    const tris = (buf) => new DataView(buf).getUint32(80, true);
    const clearBuf = exportRibsSTL(buildStraightPattern(clearP), clearP);
    const interBuf = exportRibsSTL(buildStraightPattern(interP), interP);
    // trapezoid ribs stay 4-vertex -> 12 tri each, same header count as clear rectangles
    expect(tris(interBuf)).toBe(tris(clearBuf));
    // but the vertex positions differ (the diagonals moved), so the buffers are not identical
    const ia = new Uint8Array(interBuf);
    const ca = new Uint8Array(clearBuf);
    expect(ia.length).toBe(ca.length);
    expect(ia.some((b, i) => b !== ca[i])).toBe(true);
  });

  it('the removed pointed/alternating modes now normalize to interlock (migration reaches geometry)', () => {
    expect(normalizeParams({ ...DEFAULT_PARAMS, cornerMode: 'pointed' }).cornerMode).toBe('interlock');
    expect(normalizeParams({ ...DEFAULT_PARAMS, cornerMode: 'alternating' }).cornerMode).toBe('interlock');
  });
});
