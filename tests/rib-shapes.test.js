// tests/rib-shapes.test.js
import { describe, it, expect } from 'vitest';
import { computeRibShapes } from '../src/geometry/ribShapes.js';
import { computeMetrics } from '../src/geometry/metrics.js';
import { computeFaceFoldWidths } from '../src/geometry/tapered.js';
import { DEFAULT_PARAMS } from '../src/params.js';

const A6 = { ...DEFAULT_PARAMS, frontW: 160, frontH: 115, rearW: 160, rearH: 115 };
const TAPERED = {
  ...DEFAULT_PARAMS, type: 'tapered',
  rearW: 200, frontW: 100, rearH: 200, frontH: 100,
};

describe('computeRibShapes — clear mode', () => {
  it('emits 4*ribCount entries (four walls per ring)', () => {
    const rc = computeMetrics({ ...DEFAULT_PARAMS }).ribCount; // 25
    const shapes = computeRibShapes({ ...DEFAULT_PARAMS });
    expect(shapes.length).toBe(4 * rc); // 100
  });

  it('tags four walls: two W and two H at wallIndex 0..3 = [W,H,W,H]', () => {
    const shapes = computeRibShapes({ ...DEFAULT_PARAMS });
    const byWall = [0, 1, 2, 3].map((w) => shapes.find((s) => s.wallIndex === w).face);
    expect(byWall).toEqual(['W', 'H', 'W', 'H']);
    const wCount = shapes.filter((s) => s.face === 'W').length;
    const hCount = shapes.filter((s) => s.face === 'H').length;
    expect(wCount).toBe(hCount);
    expect(new Set(shapes.map((s) => s.wallIndex))).toEqual(new Set([0, 1, 2, 3]));
  });

  it('uses the inset clear width faceWidth - 2*cornerAllowance (straight default 120)', () => {
    const shapes = computeRibShapes({ ...DEFAULT_PARAMS });
    for (const s of shapes) expect(s.width).toBeCloseTo(150 - 2 * 15, 6); // 120
  });

  it('insets each face independently on a rectangular (A6) tube', () => {
    const shapes = computeRibShapes(A6);
    const w = shapes.filter((s) => s.face === 'W');
    const h = shapes.filter((s) => s.face === 'H');
    for (const s of w) expect(s.width).toBeCloseTo(160 - 2 * 15, 6); // 130
    for (const s of h) expect(s.width).toBeCloseTo(115 - 2 * 15, 6); // 85
  });

  it('takes the per-pleat fold width for tapered walls (rear->front)', () => {
    const { width: wFold, height: hFold } = computeFaceFoldWidths(TAPERED);
    const rc = computeMetrics(TAPERED).ribCount;
    const shapes = computeRibShapes(TAPERED);
    const wWall = shapes.filter((s) => s.face === 'W' && s.wallIndex === 0);
    const hWall = shapes.filter((s) => s.face === 'H' && s.wallIndex === 1);
    // endpoints: rear (rib 0) vs front (last rib)
    expect(wWall[0].width).toBeCloseTo(wFold[0] - 30, 6);       // 200-30 = 170
    expect(wWall[rc - 1].width).toBeCloseTo(wFold[rc - 1] - 30, 6); // 100-30 = 70
    expect(hWall[0].width).toBeCloseTo(hFold[0] - 30, 6);
    expect(wWall[0].width).not.toBeCloseTo(wWall[rc - 1].width, 3); // actually tapers
    // every rib keys to its pleat
    for (let i = 0; i < rc; i++) expect(wWall[i].width).toBeCloseTo(wFold[i] - 30, 6);
  });

  it('steps yBand by pitch, rib-high bands', () => {
    const { pitch, ribCount } = computeMetrics({ ...DEFAULT_PARAMS });
    const rib = DEFAULT_PARAMS.rib;
    const wall0 = computeRibShapes({ ...DEFAULT_PARAMS })
      .filter((s) => s.wallIndex === 0)
      .sort((a, b) => a.ribIndex - b.ribIndex);
    expect(wall0.length).toBe(ribCount);
    for (let i = 0; i < ribCount; i++) {
      expect(wall0[i].yBand.y0).toBeCloseTo(i * pitch, 6);
      expect(wall0[i].yBand.y1).toBeCloseTo(i * pitch + rib, 6);
    }
  });

  it('carries cornerShare keys with adjacent walls sharing a corner', () => {
    const shapes = computeRibShapes({ ...DEFAULT_PARAMS });
    const share = (w) => shapes.find((s) => s.wallIndex === w).cornerShare;
    expect(share(0)).toEqual({ leftCorner: 3, rightCorner: 0 });
    expect(share(1)).toEqual({ leftCorner: 0, rightCorner: 1 });
    expect(share(2)).toEqual({ leftCorner: 1, rightCorner: 2 });
    expect(share(3)).toEqual({ leftCorner: 2, rightCorner: 3 });
    // wall0.rightCorner == wall1.leftCorner (adjacent walls meet at corner 0)
    expect(share(0).rightCorner).toBe(share(1).leftCorner);
    // all four ring corners are covered exactly twice
    const corners = shapes.filter((s) => s.ribIndex === 0)
      .flatMap((s) => [s.cornerShare.leftCorner, s.cornerShare.rightCorner]);
    for (const c of [0, 1, 2, 3]) expect(corners.filter((x) => x === c).length).toBe(2);
  });

  it('clear-mode points are the inset rectangle (0..width x 0..rib)', () => {
    const rib = DEFAULT_PARAMS.rib;
    const s = computeRibShapes({ ...DEFAULT_PARAMS }).find((x) => x.wallIndex === 0 && x.ribIndex === 0);
    expect(s.points).toEqual([
      { x: 0, y: 0 },
      { x: s.width, y: 0 },
      { x: s.width, y: rib },
      { x: 0, y: rib },
    ]);
    // rib-local: x spans exactly the width, y spans exactly the rib band
    const xs = s.points.map((p) => p.x);
    const ys = s.points.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(s.width, 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(rib, 6);
  });
});
