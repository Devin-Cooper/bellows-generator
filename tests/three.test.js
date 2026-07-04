// tests/three.test.js
import { describe, it, expect } from 'vitest';
import { foldModelToGeometry } from '../src/render/three.js';
import { buildFoldModel } from '../src/geometry/index.js';
import { DEFAULT_PARAMS } from '../src/params.js';

describe('foldModelToGeometry', () => {
  it('builds a BufferGeometry with one position per FoldModel vertex', () => {
    const fold = buildFoldModel(DEFAULT_PARAMS, 0.5);
    const geometry = foldModelToGeometry(fold);
    const position = geometry.getAttribute('position');
    expect(position.count).toBe(fold.positions.length / 3);
    expect(position.itemSize).toBe(3);
    expect(geometry.getIndex().count).toBe(fold.indices.length);
  });

  it('regenerates matching vertex counts across extensions', () => {
    const collapsed = foldModelToGeometry(buildFoldModel(DEFAULT_PARAMS, 0));
    const extended = foldModelToGeometry(buildFoldModel(DEFAULT_PARAMS, 1));
    expect(collapsed.getAttribute('position').count).toBe(
      extended.getAttribute('position').count,
    );
    expect(collapsed.getIndex().count).toBe(extended.getIndex().count);
  });
});
