import { describe, it, expect } from 'vitest';
import { buildStraightPattern } from '../src/geometry/straight.js';
import { buildTaperedPattern } from '../src/geometry/tapered.js';
import { renderRibLadderSVG } from '../src/render/svg.js';
import { exportRibsSTL } from '../src/export/stl.js';
import { normalizeParams, DEFAULT_PARAMS } from '../src/params.js';

const engrave = (model) => model.segments.filter((s) => s.layer === 'ENGRAVE');
const maxPts = (model) => Math.max(...engrave(model).map((s) => s.points.length));

describe('cornerMode=interlock propagates from computeRibShapes to every consumer', () => {
  it('straight fabric footprints gain point/notch vertices in interlock mode (4 -> >4)', () => {
    const clear = buildStraightPattern(normalizeParams({ ...DEFAULT_PARAMS, cornerMode: 'clear' }));
    const inter = buildStraightPattern(normalizeParams({ ...DEFAULT_PARAMS, cornerMode: 'interlock' }));
    expect(maxPts(clear)).toBe(4);
    expect(maxPts(inter)).toBeGreaterThan(4);
  });

  it('tapered fabric footprints gain vertices in interlock mode', () => {
    const base = { ...DEFAULT_PARAMS, type: 'tapered', rearW: 200, rearH: 160, frontW: 120, frontH: 90 };
    expect(maxPts(buildTaperedPattern({ ...base, cornerMode: 'interlock' }))).toBeGreaterThan(4);
  });

  it('rib-ladder SVG cut outline reflects the interlock ends (more path vertices than clear)', () => {
    const clearP = normalizeParams({ ...DEFAULT_PARAMS, cornerMode: 'clear' });
    const interP = normalizeParams({ ...DEFAULT_PARAMS, cornerMode: 'interlock' });
    const clearSvg = renderRibLadderSVG(buildStraightPattern(clearP), clearP);
    const interSvg = renderRibLadderSVG(buildStraightPattern(interP), interP);
    const verts = (s) => (s.match(/[ML]/g) || []).length;
    expect(interSvg).not.toBe(clearSvg);
    expect(verts(interSvg)).toBeGreaterThan(verts(clearSvg));
  });

  it('STL triangle count grows when ribs gain interlock ends (shape-aware count)', () => {
    const clearP = normalizeParams({ ...DEFAULT_PARAMS, cornerMode: 'clear' });
    const interP = normalizeParams({ ...DEFAULT_PARAMS, cornerMode: 'interlock' });
    const tris = (buf) => new DataView(buf).getUint32(80, true);
    const clearBuf = exportRibsSTL(buildStraightPattern(clearP), clearP);
    const interBuf = exportRibsSTL(buildStraightPattern(interP), interP);
    expect(tris(interBuf)).toBeGreaterThan(tris(clearBuf));
  });

  it('the removed pointed/alternating modes now normalize to interlock (migration reaches geometry)', () => {
    expect(normalizeParams({ ...DEFAULT_PARAMS, cornerMode: 'pointed' }).cornerMode).toBe('interlock');
    expect(normalizeParams({ ...DEFAULT_PARAMS, cornerMode: 'alternating' }).cornerMode).toBe('interlock');
  });
});
