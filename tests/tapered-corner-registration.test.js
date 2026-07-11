// tests/tapered-corner-registration.test.js
// A tapered bellows must lay its faces so adjacent faces ABUT along a shared (slanting) corner
// edge, keeping the rib-to-rib corner gap CONSTANT at 2*cornerAllowance for every pleat. The old
// fixed-rear-centre column layout let the gap balloon toward the front (~30mm rear -> ~85mm front),
// so interlock corner half-points no longer registered. These tests pin the constant-gap invariant.
import { describe, it, expect } from 'vitest';
import { buildTaperedPattern } from '../src/geometry/tapered.js';
import { LAYER } from '../src/constants.js';
import { DEFAULT_PARAMS } from '../src/params.js';

const TAPER = {
  ...DEFAULT_PARAMS, type: 'tapered', cornerMode: 'clear',
  rearW: 200, rearH: 150, frontW: 100, frontH: 80, cornerAllowance: 15,
};

/** ENGRAVE footprints grouped into pleat rows (by band-top y), each row sorted left->right. */
function footprintRows(model) {
  const eng = model.segments.filter((s) => s.type === LAYER.ENGRAVE);
  const byPleat = new Map();
  for (const s of eng) {
    const xs = s.points.map((p) => p.x);
    const y0 = Math.round(Math.min(...s.points.map((p) => p.y)) * 100) / 100;
    if (!byPleat.has(y0)) byPleat.set(y0, []);
    byPleat.get(y0).push({ left: Math.min(...xs), right: Math.max(...xs) });
  }
  return [...byPleat.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, row]) => row.sort((a, b) => a.left - b.left));
}

describe('tapered corner registration', () => {
  it('keeps every rib-to-rib corner gap constant at 2*cornerAllowance (clear footprints)', () => {
    const model = buildTaperedPattern(TAPER);
    const rows = footprintRows(model);
    expect(rows.length).toBe(model.metrics.ribCount);
    for (const row of rows) {
      expect(row.length).toBe(5); // halfW | H | W | H | halfW
      for (let c = 0; c < row.length - 1; c++) {
        expect(row[c + 1].left - row[c].right).toBeCloseTo(2 * TAPER.cornerAllowance, 4);
      }
    }
  });

  it('lays each pleat band symmetric about the sheet centreline (rearW+rearH)', () => {
    const model = buildTaperedPattern(TAPER);
    const Xc = TAPER.rearW + TAPER.rearH;
    for (const row of footprintRows(model)) {
      const L = row[0].left;
      const R = row[row.length - 1].right;
      expect((L + R) / 2).toBeCloseTo(Xc, 4);
    }
  });

  it('narrows the total pleat-band width from rear to front (faces fan in, not diverge)', () => {
    const rows = footprintRows(buildTaperedPattern(TAPER));
    const widthOf = (row) => row[row.length - 1].right - row[0].left;
    const rear = widthOf(rows[0]);
    const front = widthOf(rows[rows.length - 1]);
    expect(front).toBeLessThan(rear);
    // clear rear span = 2*(rearW+rearH) - 2*ca (two seam edges have no inset)... check it shrank a lot
    expect(rear - front).toBeGreaterThan(100);
  });

  it('still sizes bounds from the widest (rear) row + glue tab', () => {
    const model = buildTaperedPattern(TAPER);
    expect(model.bounds.w).toBeCloseTo(2 * 200 + 2 * 150 + DEFAULT_PARAMS.glueTab, 6);
    expect(model.seamFaceIndex).toBe(4);
  });
});
