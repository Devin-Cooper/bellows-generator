// tests/rib-ladder-tapered.test.js
import { describe, it, expect } from 'vitest';
import { renderRibLadderSVG } from '../src/render/svg.js';
import { computeMetrics } from '../src/geometry/metrics.js';
import { normalizeParams, DEFAULT_PARAMS } from '../src/params.js';

function ladder(overrides = {}) {
  const params = normalizeParams({ ...DEFAULT_PARAMS, cornerMode: 'clear', ...overrides });
  const model = { metrics: computeMetrics(params) };
  return { svg: renderRibLadderSVG(model, params), params };
}

function firstLadderD(svg) {
  const m = svg.match(/<path data-role="ladder"[^>]*\bd="([^"]*)"/);
  return m[1];
}
function xCoords(d) {
  const nums = d.match(/-?[\d.]+/g).map(Number);
  return nums.filter((_, i) => i % 2 === 0);
}
/** All (x,y) vertices of a path's FIRST subpath (the outer boundary, up to the first Z). */
function outerBoundaryPts(d) {
  const first = d.split(/\s*Z\s*/)[0];
  const nums = first.match(/-?[\d.]+/g).map(Number);
  const pts = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
  return pts;
}
/** Spine centreline x of the first column (FOLD_VALLEY <line data-role="spine">). */
function firstSpineX(svg) {
  const m = svg.match(/<line data-role="spine"[^>]*\bx1="([\d.]+)"/);
  return Number(m[1]);
}

describe('renderRibLadderSVG — tapered per-pleat trapezoids (P3)', () => {
  it('uses the REAR (wider) width, not front-only', () => {
    const { svg, params } = ladder({
      type: 'tapered',
      frontW: 100, rearW: 200, frontH: 100, rearH: 200,
    });
    const ca = params.cornerAllowance;
    const d = firstLadderD(svg);
    const xs = xCoords(d);
    const span = Math.max(...xs) - Math.min(...xs);
    // widest pleat = rear: 200 - 2*ca; front-only bug would give 100 - 2*ca
    expect(span).toBeCloseTo(200 - 2 * ca + params.kerf, 4);
  });

  it('tapers: some ribs are much narrower than the widest (trapezoid, not rectangle)', () => {
    const { svg, params } = ladder({
      type: 'tapered',
      frontW: 100, rearW: 200, frontH: 100, rearH: 200,
    });
    const colX0 = 5 + params.kerf / 2;
    const xs = xCoords(firstLadderD(svg));
    const rightXs = xs.filter((x) => x > colX0 + 40); // rib right edges + notch inners
    // a front-region rib right edge sits far left of the rear one -> taper present
    expect(Math.min(...rightXs)).toBeLessThan(colX0 + 100);
    expect(Math.max(...rightXs)).toBeGreaterThan(colX0 + 160);
  });

  // A snap-apart ladder folds flat about its central spine, so every rib must be CENTRED on that
  // spine — the taper narrows the rib symmetrically on BOTH sides. The old bug LEFT-aligned ribs at
  // colX0, leaving a dead-straight left edge with the whole taper on the right and the spine sitting
  // ~(widthMax-width)/2 off every narrow rib's centre. Assert mirror symmetry of the column outline
  // about the spine x (kerf offset is symmetric, so it preserves the mirror).
  it('centres each rib on the fold spine (outline is mirror-symmetric about the spine x)', () => {
    const { svg } = ladder({
      type: 'tapered',
      frontW: 100, rearW: 200, frontH: 100, rearH: 200,
    });
    const cx = firstSpineX(svg);
    const pts = outerBoundaryPts(firstLadderD(svg));
    const key = (x, y) => `${Math.round(x * 100) / 100},${Math.round(y * 100) / 100}`;
    const have = new Set(pts.map((p) => key(p.x, p.y)));
    // every outline vertex must have its mirror (2*cx - x, y) in the outline
    const unmatched = pts.filter((p) => {
      const mx = 2 * cx - p.x;
      return !pts.some((q) => Math.abs(q.x - mx) < 0.05 && Math.abs(q.y - p.y) < 0.05);
    });
    expect(unmatched).toEqual([]);
    // and the taper must be real on the LEFT side too (front rib left edge inset from the rear's)
    const xsLeft = pts.filter((p) => p.x < cx).map((p) => p.x);
    expect(Math.max(...xsLeft) - Math.min(...xsLeft)).toBeGreaterThan(20);
  });
});
