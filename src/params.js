export const DEFAULT_PARAMS = {
  type: 'straight',
  frontW: 150, frontH: 150, rearW: 150, rearH: 150,
  maxDraw: 300, drawFactor: 1.2,
  rib: 12, gap: 2.5, ribCount: null, cornerAllowance: 15,
  glueTab: 10, endMargin: 35,
  fabricThickness: 0.5, ribThickness: 0.4, kerf: 0.15,
  focalLength: 150, opticalOffset: 40,
  // Stiffener overhaul: corner-stiffening mode + 3D-print bed/offset.
  // cornerMode: 'clear' (default, open corners) | 'interlock' (complementary point/notch
  // corners that nest as the tube folds). Legacy 'pointed'/'alternating' migrate to
  // 'interlock' in normalizeParams. bedSize = 3D print bed (mm) for column bed-wrap.
  // printOffset = inward 3D offset (mm), opposite sign to laser kerf.
  cornerMode: 'clear', bedSize: 220, printOffset: 0.1,
  // Laser cutting bed (mm): master sheets tile into bedW x bedH cells. Distinct from the
  // 3D-print bedSize and the retired A4/A3 printer pageSize. Default 24x16in.
  bedW: 609.6, bedH: 406.4,
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
  // Migrate the removed corner modes. The remap lives HERE (not only in paramsFromQuery) so
  // every restore path — query string, localStorage, and presets — collapses the old
  // 'pointed'/'alternating' onto the reworked 'interlock' geometry. 'clear'/'interlock'/
  // undefined are left untouched.
  if (p.cornerMode === 'pointed' || p.cornerMode === 'alternating') {
    p.cornerMode = 'interlock';
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
