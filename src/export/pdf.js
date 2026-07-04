// src/export/pdf.js
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { LAYER_COLORS } from '../constants.js';

export const MM_TO_PT = 72 / 25.4; // 2.834645669...
export const CALIBRATION_MM = 50;
export const CALIBRATION_IN = 1;
const IN_TO_PT = 72;
const OVERLAP_MM = 10;

const PAGE_DIMS_PT = {
  A4: { w: 210 * MM_TO_PT, h: 297 * MM_TO_PT },
  A3: { w: 297 * MM_TO_PT, h: 420 * MM_TO_PT },
  Letter: { w: 8.5 * IN_TO_PT, h: 11 * IN_TO_PT },
};

export function pageDimsPt(pageSize) {
  return PAGE_DIMS_PT[pageSize] || PAGE_DIMS_PT.A4;
}

export function computePageGrid(bounds, params) {
  const page = pageDimsPt(params.pageSize);
  const marginPt = OVERLAP_MM * MM_TO_PT;
  const stepX = page.w - 2 * marginPt;
  const stepY = page.h - 2 * marginPt;
  const contentW = bounds.w * MM_TO_PT;
  const contentH = bounds.h * MM_TO_PT;
  const cols = Math.max(1, Math.ceil(contentW / stepX));
  const rows = Math.max(1, Math.ceil(contentH / stepY));
  return { cols, rows, pageCount: cols * rows, stepX, stepY, marginPt, page };
}

function hexToRgb(hex) {
  const h = (hex || '#000000').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return rgb(r, g, b);
}

function drawCropMarks(pg, page, marginPt) {
  const len = 12;
  const black = rgb(0, 0, 0);
  const corners = [
    { x: marginPt, y: marginPt },
    { x: page.w - marginPt, y: marginPt },
    { x: marginPt, y: page.h - marginPt },
    { x: page.w - marginPt, y: page.h - marginPt },
  ];
  for (const c of corners) {
    pg.drawLine({ start: { x: c.x - len, y: c.y }, end: { x: c.x + len, y: c.y }, thickness: 0.4, color: black });
    pg.drawLine({ start: { x: c.x, y: c.y - len }, end: { x: c.x, y: c.y + len }, thickness: 0.4, color: black });
  }
}

function drawCalibration(pg, page, marginPt, font) {
  const black = rgb(0, 0, 0);
  const size50 = CALIBRATION_MM * MM_TO_PT;
  const size1in = CALIBRATION_IN * IN_TO_PT;
  const baseX = marginPt + 6;
  const baseY = page.h - marginPt - 6 - size50;

  pg.drawRectangle({ x: baseX, y: baseY, width: size50, height: size50, borderWidth: 0.6, borderColor: black });
  pg.drawText('50 mm', { x: baseX + 2, y: baseY + size50 + 3, size: 7, font, color: black });

  const inX = baseX + size50 + 12;
  const inY = baseY + size50 - size1in;
  pg.drawRectangle({ x: inX, y: inY, width: size1in, height: size1in, borderWidth: 0.6, borderColor: black });
  pg.drawText('1 in', { x: inX + 2, y: inY + size1in + 3, size: 7, font, color: black });

  // Short 100mm ruler with 10mm ticks below the squares.
  const rulerY = baseY - 16;
  const rulerLen = 100 * MM_TO_PT;
  pg.drawLine({ start: { x: baseX, y: rulerY }, end: { x: baseX + rulerLen, y: rulerY }, thickness: 0.5, color: black });
  for (let mm = 0; mm <= 100; mm += 10) {
    const tx = baseX + mm * MM_TO_PT;
    pg.drawLine({ start: { x: tx, y: rulerY }, end: { x: tx, y: rulerY - 5 }, thickness: 0.4, color: black });
  }
  pg.drawText('0                              100 mm', { x: baseX, y: rulerY - 14, size: 6, font, color: black });
}

export async function exportTiledPDF(model, params) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const grid = computePageGrid(model.bounds, params);
  const { cols, rows, marginPt, stepX, stepY, page } = grid;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const pg = pdf.addPage([page.w, page.h]);
      const pageNum = row * cols + col + 1;
      const originX = col * stepX;
      const originY = row * stepY;

      for (const seg of model.segments) {
        const color = hexToRgb(LAYER_COLORS[seg.type]);
        const pts = seg.points;
        if (pts.length < 2) continue;
        const edges = seg.closed ? pts.length : pts.length - 1;
        for (let i = 0; i < edges; i++) {
          const a = pts[i];
          const b = pts[(i + 1) % pts.length];
          const ax = a.x * MM_TO_PT - originX + marginPt;
          const ay = page.h - (a.y * MM_TO_PT - originY + marginPt);
          const bx = b.x * MM_TO_PT - originX + marginPt;
          const by = page.h - (b.y * MM_TO_PT - originY + marginPt);
          pg.drawLine({ start: { x: ax, y: ay }, end: { x: bx, y: by }, thickness: 0.5, color });
        }
      }

      drawCropMarks(pg, page, marginPt);
      pg.drawText(`Page ${pageNum}/${cols * rows}  col ${col + 1} row ${row + 1}`, {
        x: marginPt, y: marginPt - 12, size: 8, font, color: rgb(0, 0, 0),
      });
      if (pageNum === 1) drawCalibration(pg, page, marginPt, font);
    }
  }

  return pdf.save();
}
