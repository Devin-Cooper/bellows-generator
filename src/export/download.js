/**
 * Wrap an SVG string in a Blob for download. Pure — no DOM access.
 * @param {string} svg
 * @returns {Blob}
 */
export function makeSVGBlob(svg) {
  return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
}
