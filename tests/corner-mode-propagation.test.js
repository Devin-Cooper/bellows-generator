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

// A CORRECTED interlock end is a 4-vertex TRAPEZOID whose reach POINT sits on a BAND EDGE (the
// footprint's yMin/yMax fold lines), never at mid-depth. `distinctXs>2` ALSO held for the deleted
// concave-notch hexagon (6 vertices, apex at depth/2), so pin the apex to catch that regression.
const pinTrapezoidApex = (seg) => {
  const ys = seg.points.map((p) => p.y);
  const xs = seg.points.map((p) => p.x);
  const yMin = Math.min(...ys), yMax = Math.max(...ys), yMid = (yMin + yMax) / 2;
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  expect(seg.points.length).toBe(4);                                       // trapezoid, not a 6-pt hexagon
  expect(seg.points.some((p) => Math.abs(p.y - yMid) < 1e-6)).toBe(false); // no mid-depth apex/notch vertex
  for (const p of seg.points) {
    if (Math.abs(p.x - xMin) < 1e-6 || Math.abs(p.x - xMax) < 1e-6) {
      // the point/apex vertex (global min/max x) sits ON a band edge (fold line), never mid-depth.
      expect(Math.min(Math.abs(p.y - yMin), Math.abs(p.y - yMax))).toBeLessThan(1e-6);
    }
  }
};
const pinInterlockTraps = (model) => {
  const traps = engrave(model).filter((s) => distinctXs(s) > 2);
  expect(traps.length).toBeGreaterThan(0);
  for (const s of traps) pinTrapezoidApex(s);
};

describe('cornerMode=interlock propagates from computeRibShapes to every consumer', () => {
  it('straight fabric footprints become trapezoids in interlock mode (2 rail x-values -> >2)', () => {
    const clear = buildStraightPattern(normalizeParams({ ...DEFAULT_PARAMS, cornerMode: 'clear' }));
    const inter = buildStraightPattern(normalizeParams({ ...DEFAULT_PARAMS, cornerMode: 'interlock' }));
    expect(maxDistinctX(clear)).toBe(2);        // rectangles: two rail x's
    expect(maxDistinctX(inter)).toBeGreaterThan(2); // trapezoids: reach + setback x's
    pinInterlockTraps(inter); // HARDEN: apex on a band edge, 4-vertex — not the old mid-depth hexagon
  });

  it('tapered fabric footprints become trapezoids in interlock mode', () => {
    const b = { ...DEFAULT_PARAMS, type: 'tapered', rearW: 200, rearH: 160, frontW: 120, frontH: 90 };
    expect(maxDistinctX(buildTaperedPattern(normalizeParams({ ...b, cornerMode: 'clear' })))).toBe(2);
    const inter = buildTaperedPattern(normalizeParams({ ...b, cornerMode: 'interlock' }));
    expect(maxDistinctX(inter)).toBeGreaterThan(2);
    pinInterlockTraps(inter); // HARDEN: apex on a band edge, 4-vertex — not the old mid-depth hexagon
  });

  it('rib-ladder SVG cut outline reflects the interlock trapezoid ends (differs from clear; more distinct rail x)', () => {
    const clearP = normalizeParams({ ...DEFAULT_PARAMS, cornerMode: 'clear' });
    const interP = normalizeParams({ ...DEFAULT_PARAMS, cornerMode: 'interlock' });
    const interModel = buildStraightPattern(interP);
    const clearSvg = renderRibLadderSVG(buildStraightPattern(clearP), clearP);
    const interSvg = renderRibLadderSVG(interModel, interP);
    expect(interSvg).not.toBe(clearSvg);
    // distinct x-values across the ladder cut paths: the diagonals introduce reach/setback x's
    const ladderXs = (svg) => {
      const ds = [...svg.matchAll(/<path data-role="ladder"[^>]*\bd="([^"]*)"/g)].map((m) => m[1]).join(' ');
      const set = new Set();
      for (const t of ds.matchAll(/[ML] (-?[\d.]+) /g)) set.add(t[1]);
      return set.size;
    };
    expect(ladderXs(interSvg)).toBeGreaterThan(ladderXs(clearSvg));

    // HARDEN: those extra x's are reach APEXES that must PROJECT past the clear rail and sit ON a
    // fold-line band edge — not a mid-depth notch (the deleted hexagon, which the ladder would trace
    // as a plain rectangle with NO outward jut). Pin the interlock W-column outward juts.
    const num = (re, s) => Number(re.exec(s)[1]);
    // colX0 derived from the spine center and the clear width from params (qty notes are retired).
    const spineCx = num(/<line data-role="spine" data-face="W"[^>]*\bx1="([-\d.]+)"/, interSvg);
    const clearW = interP.frontW - 2 * interP.cornerAllowance;
    const colX0 = spineCx - clearW / 2;
    const wD = /<path data-role="ladder" data-face="W"[^>]*\bd="([^"]*)"/.exec(interSvg)[1];
    const outerNums = wD.split('Z')[0].match(/-?[\d.]+/g).map(Number);
    const verts = [];
    for (let i = 0; i < outerNums.length; i += 2) verts.push({ x: outerNums[i], y: outerNums[i + 1] });
    const { ribCount, pitch } = interModel.metrics;
    const bandEdges = [];
    for (let r = 0; r < ribCount; r++) {
      const yTop = interP.endMargin + r * pitch;
      bandEdges.push(yTop, yTop + interP.rib);
    }
    const juts = verts.filter((p) => p.x < colX0 - 0.5 || p.x > colX0 + clearW + 0.5);
    expect(juts.length).toBeGreaterThan(0); // the interlock point actually projects OUT past a rail
    for (const p of juts) {
      expect(Math.min(...bandEdges.map((e) => Math.abs(p.y - e)))).toBeLessThan(0.3); // apex ON a fold line
    }
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
