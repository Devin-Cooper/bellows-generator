// tests/stl-printability.test.js
import { describe, it, expect } from 'vitest';
import { computeRibOutlines } from '../src/export/stl.js';
import { DEFAULT_PARAMS } from '../src/params.js';

const model = { segments: [], regions: [], seamFaceIndex: 0, bounds: { w: 0, h: 0 }, metrics: { ribCount: 5 } };
const base = {
  ...DEFAULT_PARAMS, type: 'straight', ribCount: 5,
  frontW: 150, frontH: 150, rearW: 150, rearH: 150,
  cornerAllowance: 15, rib: 12, gap: 2.5, ribThickness: 0.4, printOffset: 0,
};
const wSegs = (outs) => new Set(outs.filter((o) => o.kind === 'rib' && o.face === 'W').map((o) => o.segmentIndex));

describe('STL printability — bed-wrap segmentation', () => {
  it('a column that fits the bed stays a single segment', () => {
    // 5 ribs -> 12 + 4*14.5 = 70mm column; well under 1000
    expect(wSegs(computeRibOutlines(model, { ...base, bedSize: 1000 })).size).toBe(1);
  });

  it('a column longer than bedSize splits into >1 bed-fitting segment', () => {
    // bedSize 40: rib depth 12, pitch add 14.5 -> [0,1]=26.5, [2,3]=26.5, [4] -> 3 segments
    expect(wSegs(computeRibOutlines(model, { ...base, bedSize: 40 })).size).toBe(3);
  });

  it('every bed segment fits within bedSize along the column', () => {
    const bedSize = 40;
    const outs = computeRibOutlines(model, { ...base, bedSize }).filter((o) => o.kind === 'rib');
    const span = {};
    for (const o of outs) {
      const k = `${o.face}:${o.segmentIndex}`;
      const ys = o.points.map((p) => p.y);
      span[k] = span[k] || { lo: Infinity, hi: -Infinity };
      span[k].lo = Math.min(span[k].lo, ...ys);
      span[k].hi = Math.max(span[k].hi, ...ys);
    }
    for (const k of Object.keys(span)) expect(span[k].hi - span[k].lo).toBeLessThanOrEqual(bedSize + 1e-9);
  });
});

describe('STL printability — connected breakaway bridges', () => {
  it('consecutive ribs in a segment are joined by a breakaway bridge', () => {
    const outs = computeRibOutlines(model, { ...base, bedSize: 1000 });
    expect(outs.filter((o) => o.kind === 'bridge' && o.face === 'W').length).toBe(4); // 5 ribs, 1 seg
  });

  it('no bridge spans a bed boundary (bridges == ribs - segments per family)', () => {
    const outs = computeRibOutlines(model, { ...base, bedSize: 40 });
    const wRibs = outs.filter((o) => o.kind === 'rib' && o.face === 'W').length;   // 5
    const segs = wSegs(outs).size;                                                 // 3
    const wBridges = outs.filter((o) => o.kind === 'bridge' && o.face === 'W').length;
    expect(wBridges).toBe(wRibs - segs); // 5 - 3 = 2
  });

  it('bridges are thin (<=2mm across) so they snap away after bonding', () => {
    const outs = computeRibOutlines(model, { ...base, bedSize: 1000 });
    for (const b of outs.filter((o) => o.kind === 'bridge')) {
      const w = Math.max(...b.points.map((p) => p.x)) - Math.min(...b.points.map((p) => p.x));
      expect(w).toBeLessThanOrEqual(2 + 1e-9);
    }
  });
});
