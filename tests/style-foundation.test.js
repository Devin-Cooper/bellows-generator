// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const cssUrl = new URL('../src/style.css', import.meta.url);
const mainUrl = new URL('../src/main.js', import.meta.url);

describe('style.css foundation', () => {
  const css = () => readFileSync(cssUrl, 'utf8');

  it('defines the full :root token block', () => {
    const src = css();
    for (const token of [
      '--bg', '--surface', '--surface-2', '--text', '--muted', '--border',
      '--accent', '--accent-contrast', '--warn', '--danger', '--focus',
      '--radius', '--space-1', '--space-2', '--space-3', '--space-4',
      '--font-sans', '--font-mono',
    ]) {
      expect(src, `missing token ${token}`).toContain(`${token}:`);
    }
  });

  it('uses the workshop amber accent and a dark-mode override block', () => {
    const src = css();
    expect(src).toContain('#c26a15');
    expect(src).toContain('@media (prefers-color-scheme: dark)');
  });

  it('styles the pinned structural classes', () => {
    const src = css();
    for (const sel of [
      '.app-shell', '.app-header', '.app-title', '.header-actions',
      '.controls', '.field', '.field-label', '.field-unit', '.hint',
      '.preview-area', '.preview-tabs', '.tab-btn', '.preview-panel',
      '.flat-preview', '.three-canvas', '.preview-toolbar', '.collapse-row',
      '.segmented-bar', '.seg-btn', '.readouts', '.readout', '.readout-k',
      '.readout-v', '.help-panel', '.export-bar', '.presets', '.btn',
      '.btn-accent', '.toggle',
    ]) {
      expect(src, `missing selector ${sel}`).toContain(sel);
    }
  });

  it('wires hint visibility, active states and warning rows', () => {
    const src = css();
    expect(src).toContain('.controls.hints-on .hint');
    expect(src).toContain('.tab-btn.is-active');
    expect(src).toContain('.preview-panel.is-active');
    expect(src).toContain('.seg-btn.is-active');
    expect(src).toContain('.readout.warn');
    expect(src).toContain('.help-panel.is-open');
  });

  it('is mobile-first with 640px + 1024px breakpoints and a11y niceties', () => {
    const src = css();
    expect(src).toContain('@media (min-width: 640px)');
    expect(src).toContain('@media (min-width: 1024px)');
    expect(src).toContain(':focus-visible');
    expect(src).toContain('@media (prefers-reduced-motion: reduce)');
    expect(src).toContain('44px');
  });

  it('main.js imports the stylesheet and loads without throwing', async () => {
    expect(readFileSync(mainUrl, 'utf8')).toContain(`import "./style.css";`);
    document.body.innerHTML = '';
    await expect(import('../src/main.js')).resolves.toBeDefined();
  });
});
