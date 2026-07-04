export const DEFAULT_PARAMS = {
  type: 'straight',
  frontW: 150, frontH: 150, rearW: 150, rearH: 150,
  maxDraw: 300, drawFactor: 1.2,
  rib: 12, gap: 2.5, ribCount: null, cornerAllowance: 15,
  glueTab: 10, endMargin: 35,
  fabricThickness: 0.5, ribThickness: 0.4, kerf: 0.15,
  focalLength: 150, opticalOffset: 40, pageSize: 'A4',
  // Stiffener overhaul: corner-point mode + 3D-print bed/offset.
  // cornerMode: 'clear' (default) | 'pointed' | 'alternating' — Phase 5 adds the
  // non-clear geometry. bedSize = 3D print bed (mm) for column bed-wrap (Phase 4).
  // printOffset = inward 3D offset (mm), opposite sign to laser kerf (Phase 4).
  cornerMode: 'clear', bedSize: 220, printOffset: 0.1,
};

export const A6_PRESET = { ...DEFAULT_PARAMS, frontW: 160, frontH: 115, rearW: 160, rearH: 115 };

/**
 * Lock rear=front for straight bellows. Pure (returns a copy).
 * A null ribCount is left as null (auto) so downstream computeRibCount/computeMetrics
 * can re-derive it on demand — preserving live tracking of maxDraw changes.
 * @param {Object} params
 * @returns {Object}
 */
export function normalizeParams(params) {
  const p = { ...params };
  if (p.type === 'straight') {
    p.rearW = p.frontW;
    p.rearH = p.frontH;
  }
  return p;
}

export function paramsToQuery(params) {
  const sp = new URLSearchParams();
  for (const key of Object.keys(DEFAULT_PARAMS)) {
    const v = params[key];
    if (v === DEFAULT_PARAMS[key]) continue;
    if (v === null || v === undefined) continue;
    sp.set(key, String(v));
  }
  const q = sp.toString();
  return q ? `?${q}` : '';
}

export function paramsFromQuery(search) {
  const sp = new URLSearchParams(search);
  const params = { ...DEFAULT_PARAMS };
  for (const [key, raw] of sp) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_PARAMS, key)) continue;
    const def = DEFAULT_PARAMS[key];
    if (typeof def === 'string') {
      params[key] = raw;
    } else {
      const n = Number(raw);
      if (Number.isFinite(n)) params[key] = n;
    }
  }
  return normalizeParams(params);
}
