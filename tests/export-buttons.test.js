// tests/export-buttons.test.js
import { describe, it, expect } from 'vitest';
import { attachSVGExportButtons } from '../src/export/download.js';

function fakeButton() {
  let handler = null;
  return {
    addEventListener: (_evt, h) => { handler = h; },
    click: () => handler(),
  };
}

function harness() {
  const downloads = [];
  const anchor = { href: '', download: '', click() {}, remove() {} };
  const doc = { createElement: () => anchor, body: { appendChild() {} } };
  const urlLib = {
    createObjectURL: (blob) => { downloads.push(blob); return 'blob:x'; },
    revokeObjectURL() {},
  };
  return { downloads, anchor, doc, urlLib };
}

describe('attachSVGExportButtons', () => {
  it('downloads the fold-pattern SVG when the fold button is clicked', async () => {
    const { downloads, anchor, doc, urlLib } = harness();
    const foldBtn = fakeButton();
    const ribBtn = fakeButton();
    attachSVGExportButtons({
      foldBtn,
      ribBtn,
      getModel: () => ({ tag: 'model' }),
      getParams: () => ({ tag: 'params' }),
      doc,
      urlLib,
      patternRenderer: (m, p) => `<svg data-fold="${m.tag}-${p.tag}"/>`,
      ladderRenderer: () => '<svg data-rib="1"/>',
    });

    foldBtn.click();
    expect(anchor.download).toBe('bellows-fold-pattern.svg');
    expect(downloads.length).toBe(1);
    expect(await downloads[0].text()).toContain('data-fold="model-params"');
  });

  it('downloads the rib-ladder SVG when the rib button is clicked', async () => {
    const { downloads, anchor, doc, urlLib } = harness();
    const foldBtn = fakeButton();
    const ribBtn = fakeButton();
    attachSVGExportButtons({
      foldBtn,
      ribBtn,
      getModel: () => ({}),
      getParams: () => ({}),
      doc,
      urlLib,
      patternRenderer: () => '<svg/>',
      ladderRenderer: () => '<svg data-rib="1"/>',
    });

    ribBtn.click();
    expect(anchor.download).toBe('bellows-rib-ladder.svg');
    expect(downloads.length).toBe(1);
    expect(await downloads[0].text()).toContain('data-rib="1"');
  });
});
