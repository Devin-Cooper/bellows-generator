// tests/stl-ribshapes.test.js
import { describe, it, expect } from 'vitest';
import { exportRibsSTL, computeRibOutlines } from '../src/export/stl.js';
import { DEFAULT_PARAMS } from '../src/params.js';

const xExtent = (pts) => Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
// model is now inert: rib count comes from params via computeRibShapes, not the fake metrics.
const model = { segments: [], regions: [], seamFaceIndex: 0, bounds: { w: 0, h: 0 }, metrics: { ribCount: 5 } };
const base = {
  ...DEFAULT_PARAMS, type: 'straight', ribCount: 5,
  frontW: 150, frontH: 150, rearW: 150, rearH: 150,
  cornerAllowance: 15, rib: 12, gap: 2.5, ribThickness: 0.4,
  bedSize: 1000, printOffset: 0,
};

describe('computeRibOutlines — inset width + W/H families (P1/P2)', () => {
  it('emits both W and H rib families (P2 — a rectangular ring needs both)', () => {
    const outs = computeRibOutlines(model, base);
    const faces = new Set(outs.filter((o) => o.kind === 'rib').map((o) => o.face));
    expect(faces.has('W')).toBe(true);
    expect(faces.has('H')).toBe(true);
  });

  it('uses the INSET ladder width (120), not the full face width (150) (P1)', () => {
    const w = computeRibOutlines(model, base).find((o) => o.kind === 'rib' && o.face === 'W');
    expect(xExtent(w.points)).toBeCloseTo(120, 6); // 150 - 2*15
    expect(xExtent(w.points)).not.toBeCloseTo(150, 3);
  });

  it('applies an INWARD printOffset that shrinks the box', () => {
    const wide = computeRibOutlines(model, { ...base, printOffset: 0 }).find((o) => o.kind === 'rib' && o.face === 'W');
    const narrow = computeRibOutlines(model, { ...base, printOffset: 0.5 }).find((o) => o.kind === 'rib' && o.face === 'W');
    expect(xExtent(narrow.points)).toBeCloseTo(119, 6); // 120 - 2*0.5
    expect(xExtent(narrow.points)).toBeLessThan(xExtent(wide.points));
  });

  it('a rectangular tube emits distinct-width W and H ribs (160x115)', () => {
    const outs = computeRibOutlines(model, { ...base, frontW: 160, frontH: 115, rearW: 160, rearH: 115 });
    const w = outs.find((o) => o.kind === 'rib' && o.face === 'W');
    const h = outs.find((o) => o.kind === 'rib' && o.face === 'H');
    expect(xExtent(w.points)).toBeCloseTo(130, 6); // 160 - 30
    expect(xExtent(h.points)).toBeCloseTo(85, 6);  // 115 - 30
  });

  it('tapered W ribs vary in width across pleats (per-pleat trapezoids)', () => {
    const taper = { ...base, type: 'tapered', rearW: 200, frontW: 100, rearH: 150, frontH: 80 };
    const widths = computeRibOutlines(model, taper)
      .filter((o) => o.kind === 'rib' && o.face === 'W')
      .map((o) => Number(xExtent(o.points).toFixed(4)));
    expect(new Set(widths).size).toBeGreaterThan(1);
  });
});

describe('exportRibsSTL — shape-aware triangle count', () => {
  it('header count === sum(4V-4) over all solids and exceeds the old 12*ribCount', () => {
    const outs = computeRibOutlines(model, base);
    const expected = outs.reduce((n, s) => n + 4 * s.points.length - 4, 0);
    const buf = exportRibsSTL(model, base);
    const dv = new DataView(buf);
    expect(dv.getUint32(80, true)).toBe(expected);
    expect(buf.byteLength).toBe(84 + expected * 50);
    expect(expected).toBeGreaterThan(12 * 5); // both families -> more than W-only
  });

  it('writes finite float coordinates for the first triangle', () => {
    const dv = new DataView(exportRibsSTL(model, base));
    for (let i = 0; i < 12; i++) expect(Number.isFinite(dv.getFloat32(84 + i * 4, true))).toBe(true);
  });
});
