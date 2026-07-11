// tests/rib-ladder-interlock-layout.test.js
// Garbled-SVG fix, three parts:
//  (1) symmetric rightPad keeps the rightmost column's right POINTS on-sheet (interlock removes
//      same-band point/point collisions BY CONSTRUCTION, so rightPad is now purely an
//      off-sheet-clip guard for the rightmost column).
//  (2) a genuine per-edge outward-NORMAL offset (offsetEdges) replaces the bbox-centre radial
//      offset, so the MIDDLE wide rib's 45deg bevel is no longer tilted (the bbox offset gave the
//      centre-line apex a zero y-offset while its rails got +-kerf/2) and concave notch reflex
//      vertices offset with the correct sign.
//  (3) the tab-jog push is guarded, so a straight clear column carries no redundant zero-length
//      vertices — the clear layout stays GEOMETRICALLY identical (re-baselining the former
//      "byte-for-byte unaffected" expectation to geometric equivalence, flagged intentional).
import { describe, it, expect } from 'vitest';
import { renderRibLadderSVG, offsetEdges } from '../src/render/svg.js';
import { computeMetrics } from '../src/geometry/metrics.js';
import { normalizeParams, DEFAULT_PARAMS } from '../src/params.js';
import { cornerReachSetback } from '../src/geometry/ribShapes.js';

function ladder(overrides = {}) {
  // Pin the pre-v0.2.1 15mm corner allowance (comfortable interlock-reach gap); overrides still win.
  const params = normalizeParams({ ...DEFAULT_PARAMS, cornerAllowance: 15, ...overrides });
  const model = { metrics: computeMetrics(params) };
  return { svg: renderRibLadderSVG(model, params), params, metrics: model.metrics };
}
function ladderPaths(svg) {
  const out = [];
  const re = /<path ([^>]*?)\/>/g;
  let m;
  while ((m = re.exec(svg)) !== null) {
    const attrs = {};
    const are = /([\w-]+)="([^"]*)"/g;
    let a;
    while ((a = are.exec(m[1])) !== null) attrs[a[1]] = a[2];
    if (attrs['data-role'] === 'ladder') out.push(attrs);
  }
  return out;
}
// vertices of the OUTER subpath (everything before the first Z), in traced order.
function outerVerts(d) {
  const nums = d.split('Z')[0].trim().match(/-?[\d.]+/g).map(Number);
  const v = [];
  for (let i = 0; i < nums.length; i += 2) v.push({ x: nums[i], y: nums[i + 1] });
  return v;
}
function bbox(verts) {
  const xs = verts.map((p) => p.x);
  const ys = verts.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}
const sheetWidth = (svg) => Number(svg.match(/width="([\d.]+)mm"/)[1]);
// angle of segment a->b measured from the vertical draw axis, in degrees.
const angleFromVertical = (a, b) =>
  (Math.atan2(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) * 180) / Math.PI;

describe('renderRibLadderSVG — interlock layout is on-sheet & un-garbled', () => {
  it('(1) interlock W + H columns are fully on-sheet (minX >= 0, maxX <= sheet width)', () => {
    const { svg } = ladder({ frontW: 160, frontH: 115, cornerMode: 'interlock' });
    const W = sheetWidth(svg);
    const paths = ladderPaths(svg);
    expect(paths.length).toBe(4); // rectangular => 4 uncombined walls (W0, H1, W2, H3)
    for (const a of paths) {
      const b = bbox(outerVerts(a.d));
      expect(b.minX).toBeGreaterThanOrEqual(-1e-6);   // left points not clipped off the left edge
      expect(b.maxX).toBeLessThanOrEqual(W + 1e-6);   // right points not clipped off the right edge
    }
  });

  it('(2) an interlock apex sits on a BAND EDGE (fold line), NOT the rib mid-height, with a ~45deg diagonal', () => {
    const { svg, params, metrics } = ladder({ frontW: 160, frontH: 115, cornerMode: 'interlock' });
    const width = 160 - 2 * params.cornerAllowance;
    const { reach } = cornerReachSetback(params.rib, params.cornerAllowance);
    const colX0 = 5 + params.kerf / 2 + reach; // margin + kerf/2 + leftPad(=reach)
    const wCol = ladderPaths(svg).find((a) => a['data-face'] === 'W');
    const verts = outerVerts(wCol.d);
    // The reach apexes poke ~reach past the right rail; grown rail corners are only ~kerf/2 past it.
    const apexes = verts.map((p, i) => ({ p, i })).filter(({ p }) => p.x > colX0 + width + 1);
    expect(apexes.length).toBeGreaterThan(0);
    // every band edge (fold line) of the column, and the corresponding mid-band lines
    const datum = params.endMargin;
    const bandEdges = [];
    const midBands = [];
    for (let r = 0; r < metrics.ribCount; r++) {
      const yTop = datum + r * metrics.pitch;
      bandEdges.push(yTop, yTop + params.rib);
      midBands.push(yTop + params.rib / 2);
    }
    for (const { p, i } of apexes) {
      const dEdge = Math.min(...bandEdges.map((e) => Math.abs(p.y - e)));
      const dMid = Math.min(...midBands.map((m) => Math.abs(p.y - m)));
      expect(dEdge).toBeLessThan(0.2);                       // apex ON a fold-line band edge
      expect(dMid).toBeGreaterThan(params.rib / 2 - 0.5);    // NOT at the rib mid-height (old bug)
      // the diagonal leaving the apex toward the setback is ~45deg from the draw axis
      const prev = verts[(i - 1 + verts.length) % verts.length];
      const next = verts[(i + 1) % verts.length];
      const diag = [angleFromVertical(p, prev), angleFromVertical(p, next)]
        .sort((a, b) => Math.abs(a - 45) - Math.abs(b - 45))[0];
      expect(diag).toBeCloseTo(45, 0);
    }
  });

  it('(3) clear mode stays GEOMETRICALLY identical: no zero-length vertices, same rails/bbox', () => {
    const { svg, params } = ladder({ frontW: 160, frontH: 115, cornerMode: 'clear' });
    const wCol = ladderPaths(svg).find((a) => a['data-face'] === 'W');
    const verts = outerVerts(wCol.d);
    // (a) intentional string change: the tab-jog guard drops the duplicate collinear vertex on a
    //     straight column, so no two consecutive outer vertices coincide (no zero-length edge).
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % verts.length];
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(1e-9);
    }
    // (b) geometric equivalence: still the same kerf-grown rectangle, straight rails.
    const half = params.kerf / 2;
    const width = 160 - 2 * params.cornerAllowance;
    const colX0 = 5 + half; // margin + kerf/2, leftPad=0 in clear
    const b = bbox(verts);
    expect(b.minX).toBeCloseTo(colX0 - half, 6);
    expect(b.maxX).toBeCloseTo(colX0 + width + half, 6);
    expect(b.maxX - b.minX).toBeCloseTo(width + params.kerf, 6);
    for (const p of verts.filter((v) => v.x < colX0)) expect(p.x).toBeCloseTo(colX0 - half, 6);
    for (const p of verts.filter((v) => v.x > colX0 + width)) expect(p.x).toBeCloseTo(colX0 + width + half, 6);
  });

  it('(4) offsetEdges is a true per-edge outward-normal offset (convex + concave, winding-aware)', () => {
    const width = 20, depth = 12, reach = 6, notchDepth = 6.5, half = 0.075;
    // Polygons built in traceColumn's own winding: left rail DOWN (with left feature), then right
    // rail UP (with right feature) — the same order/winding traceColumn feeds to offsetEdges.
    const wide = [
      { x: 0, y: 0 }, { x: -reach, y: depth / 2 }, { x: 0, y: depth },
      { x: width, y: depth }, { x: width + reach, y: depth / 2 }, { x: width, y: 0 },
    ];
    const gw = offsetEdges(wide, half);
    expect(gw[4].x).toBeGreaterThan(width + reach);       // right apex grows further OUT (+x)
    expect(gw[4].y).toBeCloseTo(depth / 2, 6);            // apex stays on the y-midline (pure normal)
    expect(gw[1].x).toBeLessThan(-reach);                 // left apex grows further OUT (more -x)
    const narrow = [
      { x: 0, y: 0 }, { x: notchDepth, y: depth / 2 }, { x: 0, y: depth },
      { x: width, y: depth }, { x: width - notchDepth, y: depth / 2 }, { x: width, y: 0 },
    ];
    const gn = offsetEdges(narrow, half);
    // The reflex NOTCH tips move toward their rail (notch gets SHALLOWER) under an outward grow —
    // the exact sign the bbox-radial offset got WRONG at a reflex vertex.
    expect(gn[1].x).toBeLessThan(notchDepth);             // left notch tip toward x=0 rail
    expect(gn[4].x).toBeGreaterThan(width - notchDepth);  // right notch tip toward x=width rail
    // PIN the reflex offset RESULT to the true per-edge outward-normal miter. The reflex tip lies
    // on the y-midline where the two notch edges meet at a symmetric reflex angle, so the miter
    // pushes it purely along -x (left) / +x (right) by delta/cos(half-angle) — here ~0.1106mm, so
    // the tip lands at 6.389426 / 13.610574, NOT the ±half=±0.075 a bbox-centre radial offset
    // applies (which would land 6.425 / 13.575). This magnitude is what pins the fix: a radial
    // offset classifies the tip only by x</>cx and shifts by a flat ±half, missing the reflex angle.
    expect(gn[1].x).toBeCloseTo(6.389426, 5);
    expect(gn[1].y).toBeCloseTo(depth / 2, 6);            // pure normal: stays on the midline
    expect(gn[4].x).toBeCloseTo(13.610574, 5);
    expect(gn[4].y).toBeCloseTo(depth / 2, 6);
    // a plain axis-aligned corner still moves by (±half, ±half): matches the old offsetFromCentre,
    // so clear-mode columns are geometrically unchanged.
    const rect = [ { x: 0, y: 0 }, { x: 0, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 0 } ];
    const gr = offsetEdges(rect, half);
    expect(gr[0].x).toBeCloseTo(-half, 6); expect(gr[0].y).toBeCloseTo(-half, 6);
    expect(gr[2].x).toBeCloseTo(20 + half, 6); expect(gr[2].y).toBeCloseTo(10 + half, 6);
  });
});
