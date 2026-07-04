// tests/pdf.test.js
import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  exportTiledPDF,
  computePageGrid,
  pageDimsPt,
  MM_TO_PT,
  CALIBRATION_MM,
} from '../src/export/pdf.js';

function makeModel(w, h) {
  return {
    segments: [
      {
        type: 'CUT',
        points: [
          { x: 0, y: 0 },
          { x: w, y: 0 },
          { x: w, y: h },
          { x: 0, y: h },
        ],
        closed: true,
        layer: 'CUT',
      },
    ],
    regions: [],
    seamFaceIndex: 0,
    bounds: { w, h },
    metrics: {},
  };
}

const baseParams = { pageSize: 'A4' };

describe('exportTiledPDF', () => {
  it('exposes an exact 1mm->pt scale and a 50mm calibration size', () => {
    expect(MM_TO_PT).toBeCloseTo(72 / 25.4, 9);
    expect(CALIBRATION_MM).toBe(50);
    expect(CALIBRATION_MM * MM_TO_PT).toBeCloseTo(141.7322835, 4);
  });

  it('reports A4/A3/Letter page dimensions in points', () => {
    expect(pageDimsPt('A4').w).toBeCloseTo(210 * MM_TO_PT, 6);
    expect(pageDimsPt('A4').h).toBeCloseTo(297 * MM_TO_PT, 6);
    expect(pageDimsPt('A3').h).toBeCloseTo(420 * MM_TO_PT, 6);
    expect(pageDimsPt('Letter').w).toBeCloseTo(8.5 * 72, 6);
    expect(pageDimsPt('Letter').h).toBeCloseTo(11 * 72, 6);
  });

  it('fits a small pattern on a single page', () => {
    const grid = computePageGrid({ w: 100, h: 100 }, baseParams);
    expect(grid.pageCount).toBe(1);
  });

  it('tiles a large pattern across the expected page count', () => {
    const grid = computePageGrid({ w: 1000, h: 1000 }, baseParams);
    expect(grid.cols).toBeGreaterThan(1);
    expect(grid.rows).toBeGreaterThan(1);
    expect(grid.pageCount).toBe(grid.cols * grid.rows);
  });

  it('produces a valid PDF whose page count matches the grid', async () => {
    const model = makeModel(1000, 1000);
    const grid = computePageGrid(model.bounds, baseParams);
    const bytes = await exportTiledPDF(model, baseParams);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(grid.pageCount);
  });
});
