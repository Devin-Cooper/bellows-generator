import { describe, it, expect } from 'vitest';
import { buildStraightPattern } from '../src/geometry/straight.js';
import { buildTaperedPattern } from '../src/geometry/tapered.js';
import { renderRibLadderSVG } from '../src/render/svg.js';
import { exportRibsSTL } from '../src/export/stl.js';
import { DEFAULT_PARAMS } from '../src/params.js';

const engrave = (model) => model.segments.filter((s) => s.layer === 'ENGRAVE');
const maxPts = (model) => Math.max(...engrave(model).map((s) => s.points.length));

describe('cornerMode propagates from computeRibShapes to every consumer', () => {
  it('straight fabric footprints gain point vertices in pointed mode (4 -> >4)', () => {
    const clear = buildStraightPattern({ ...DEFAULT_PARAMS, cornerMode: 'clear' });
    const pointed = buildStraightPattern({ ...DEFAULT_PARAMS, cornerMode: 'pointed' });
    expect(maxPts(clear)).toBe(4);
    expect(maxPts(pointed)).toBeGreaterThan(4);
  });

  it('tapered fabric footprints gain point vertices in pointed mode', () => {
    const base = { ...DEFAULT_PARAMS, type: 'tapered', rearW: 200, rearH: 160, frontW: 120, frontH: 90 };
    expect(maxPts(buildTaperedPattern({ ...base, cornerMode: 'pointed' }))).toBeGreaterThan(4);
  });

  it('rib-ladder SVG cut outline reflects the point apex (more path vertices than clear)', () => {
    const clearModel = buildStraightPattern({ ...DEFAULT_PARAMS, cornerMode: 'clear' });
    const pointedModel = buildStraightPattern({ ...DEFAULT_PARAMS, cornerMode: 'pointed' });
    const clearSvg = renderRibLadderSVG(clearModel, { ...DEFAULT_PARAMS, cornerMode: 'clear' });
    const pointedSvg = renderRibLadderSVG(pointedModel, { ...DEFAULT_PARAMS, cornerMode: 'pointed' });
    const verts = (s) => (s.match(/[ML]/g) || []).length;
    expect(pointedSvg).not.toBe(clearSvg);
    expect(verts(pointedSvg)).toBeGreaterThan(verts(clearSvg));
  });

  it('STL triangle count grows when ribs gain points (shape-aware count)', () => {
    const clearModel = buildStraightPattern({ ...DEFAULT_PARAMS, cornerMode: 'clear' });
    const pointedModel = buildStraightPattern({ ...DEFAULT_PARAMS, cornerMode: 'pointed' });
    const tris = (buf) => new DataView(buf).getUint32(80, true);
    const clearBuf = exportRibsSTL(clearModel, { ...DEFAULT_PARAMS, cornerMode: 'clear' });
    const pointedBuf = exportRibsSTL(pointedModel, { ...DEFAULT_PARAMS, cornerMode: 'pointed' });
    expect(tris(pointedBuf)).toBeGreaterThan(tris(clearBuf));
  });
});
