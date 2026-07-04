import { describe, it, expect } from 'vitest';
import { makeSVGBlob } from '../src/export/download.js';

describe('makeSVGBlob', () => {
  it('returns an SVG Blob carrying the given markup', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    const blob = makeSVGBlob(svg);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/svg+xml;charset=utf-8');
    expect(await blob.text()).toBe(svg);
  });
});
