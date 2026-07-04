import { renderPatternSVG, renderRibLadderSVG } from '../render/svg.js';

/**
 * Wrap an SVG string in a Blob for download. Pure — no DOM access.
 * @param {string} svg
 * @returns {Blob}
 */
export function makeSVGBlob(svg) {
  return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
}

/**
 * Trigger a browser download for a Blob via a temporary anchor.
 * `doc`/`urlLib` are injectable so this stays testable without a DOM.
 * @param {Blob} blob
 * @param {string} filename
 * @param {{doc?: Document, urlLib?: typeof URL}} [opts]
 */
export function downloadBlob(
  blob,
  filename,
  { doc = globalThis.document, urlLib = globalThis.URL } = {}
) {
  const url = urlLib.createObjectURL(blob);
  const a = doc.createElement('a');
  a.href = url;
  a.download = filename;
  doc.body.appendChild(a);
  a.click();
  a.remove();
  urlLib.revokeObjectURL(url);
}

/**
 * Wire the "Export fold-pattern SVG" and "Export rib-ladder SVG" buttons.
 * Renderers are injectable for testing; they default to the real ones.
 * @param {{
 *   foldBtn: {addEventListener: Function},
 *   ribBtn: {addEventListener: Function},
 *   getModel: () => object,
 *   getParams: () => object,
 *   doc?: Document,
 *   urlLib?: typeof URL,
 *   patternRenderer?: (model: object, params: object) => string,
 *   ladderRenderer?: (model: object, params: object) => string,
 * }} cfg
 */
export function attachSVGExportButtons({
  foldBtn,
  ribBtn,
  getModel,
  getParams,
  doc = globalThis.document,
  urlLib = globalThis.URL,
  patternRenderer = renderPatternSVG,
  ladderRenderer = renderRibLadderSVG,
}) {
  foldBtn.addEventListener('click', () => {
    const svg = patternRenderer(getModel(), getParams());
    downloadBlob(makeSVGBlob(svg), 'bellows-fold-pattern.svg', { doc, urlLib });
  });
  ribBtn.addEventListener('click', () => {
    const svg = ladderRenderer(getModel(), getParams());
    downloadBlob(makeSVGBlob(svg), 'bellows-rib-ladder.svg', { doc, urlLib });
  });
}
