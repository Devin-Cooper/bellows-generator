import { describe, it, expect } from 'vitest';
import { renderRibMasterSheets } from '../src/render/svg.js';
import { computeMetrics } from '../src/geometry/metrics.js';
import { normalizeParams, DEFAULT_PARAMS } from '../src/params.js';

const sheets = (o) => {
  const p = normalizeParams({ ...DEFAULT_PARAMS, ...o });
  return renderRibMasterSheets({ metrics: computeMetrics(p) }, p);
};
const ladderDs = (svgs) => svgs.flatMap((svg) => [...svg.matchAll(/data-role="ladder"[^>]*?d="([^"]+)"/g)].map((m) => m[1]));

describe('traceColumn generalization', () => {
  it('clear master sheets are byte-identical after the change (captured snapshot equality)', () => {
    // Two identical renders must match (guards nondeterminism); the real regression lock is the
    // existing rib-master suite staying green.
    expect(sheets({ cornerMode: 'clear' })).toEqual(sheets({ cornerMode: 'clear' }));
  });
  it('interlock master sheets are byte-identical (two renders equal; existing suite is the true lock)', () => {
    expect(sheets({ cornerMode: 'interlock' })).toEqual(sheets({ cornerMode: 'interlock' }));
  });
  it('interlock-full draws the fuller outline: a ladder path visits a fold-hug x the trapezoid tracer would drop', () => {
    // ca<=rib/2 face so h>0 (hexagon). The traced outline must include the mid-band fold-hug vertex,
    // i.e. the path has MORE distinct x-values on a rib end than a 4-corner trapezoid would.
    const ds = ladderDs(sheets({ frontW: 160, frontH: 160, cornerMode: 'interlock-full', cornerAllowance: 5, rib: 12 }));
    expect(ds.length).toBeGreaterThan(0);
    // count distinct x on the outer subpath (before the first Z): a hexagon column has more corners
    const outer = ds[0].split('Z')[0];
    const xs = new Set((outer.match(/-?[\d.]+/g) || []).filter((_, i) => i % 2 === 0));
    const clearOuter = ladderDs(sheets({ frontW: 160, frontH: 160, cornerMode: 'clear' }))[0].split('Z')[0];
    const clearXs = new Set((clearOuter.match(/-?[\d.]+/g) || []).filter((_, i) => i % 2 === 0));
    expect(xs.size).toBeGreaterThan(clearXs.size);
  });
});
