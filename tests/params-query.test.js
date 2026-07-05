// tests/params-query.test.js
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PARAMS,
  A6_PRESET,
  normalizeParams,
  paramsToQuery,
  paramsFromQuery,
} from '../src/params.js';

describe('paramsToQuery', () => {
  it('serializes only keys that differ from DEFAULT_PARAMS', () => {
    expect(paramsToQuery({ ...DEFAULT_PARAMS, frontW: 160 })).toBe('?frontW=160');
  });

  it('returns an empty string when every key matches the defaults', () => {
    expect(paramsToQuery({ ...DEFAULT_PARAMS })).toBe('');
  });

  it('omits keys whose value is null (auto ribCount)', () => {
    const q = paramsToQuery({ ...DEFAULT_PARAMS, ribCount: null });
    expect(q).toBe('');
  });
});

describe('paramsFromQuery', () => {
  it('merges over defaults and coerces numeric fields', () => {
    const p = paramsFromQuery('?frontW=160&frontH=115');
    expect(p.frontW).toBe(160);
    expect(typeof p.frontW).toBe('number');
    expect(p.bedW).toBe(609.6);
  });

  it('ignores unknown query keys', () => {
    const p = paramsFromQuery('?bogus=1&frontW=200');
    expect(p).not.toHaveProperty('bogus');
    expect(p.frontW).toBe(200);
  });

  it('runs normalizeParams so straight locks rear to front', () => {
    const p = paramsFromQuery('?type=straight&frontW=200&frontH=120');
    expect(p.rearW).toBe(200);
    expect(p.rearH).toBe(120);
  });
});

describe('query round-trip', () => {
  it('normalized params survive toQuery -> fromQuery unchanged', () => {
    const p = normalizeParams({ ...A6_PRESET });
    expect(paramsFromQuery(paramsToQuery(p))).toEqual(p);
  });
});

describe('cornerMode migration through the query path', () => {
  it('a legacy ?cornerMode=pointed restores as interlock (via normalizeParams)', () => {
    expect(paramsFromQuery('?cornerMode=pointed').cornerMode).toBe('interlock');
  });

  it('a legacy ?cornerMode=alternating restores as interlock', () => {
    expect(paramsFromQuery('?cornerMode=alternating').cornerMode).toBe('interlock');
  });

  it('interlock round-trips through toQuery -> fromQuery', () => {
    const p = normalizeParams({ ...DEFAULT_PARAMS, cornerMode: 'interlock' });
    expect(paramsToQuery(p)).toBe('?cornerMode=interlock');
    expect(paramsFromQuery(paramsToQuery(p)).cornerMode).toBe('interlock');
  });
});
