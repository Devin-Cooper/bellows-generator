// tests/style-responsive.test.js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = readFileSync(
  fileURLToPath(new URL('../src/style.css', import.meta.url)),
  'utf8',
);
// Collapse whitespace so assertions are robust to formatting.
const flat = css.replace(/\s+/g, ' ');

describe('style.css responsive & a11y finalization', () => {
  it('has a tablet breakpoint with a 280px sidebar and a desktop 340px sidebar', () => {
    expect(flat).toContain('@media (min-width: 640px)');
    expect(flat).toContain('grid-template-columns: 280px 1fr');
    expect(flat).toContain('@media (min-width: 1024px)');
    expect(flat).toContain('grid-template-columns: 340px 1fr');
  });

  it('hides the segmented bar at >=640px and shows it in the mobile-first base', () => {
    expect(flat).toMatch(/\.segmented-bar\s*\{[^}]*display:\s*flex/);
    expect(flat).toMatch(/@media \(min-width: 640px\)[^@]*\.segmented-bar\s*\{[^}]*display:\s*none/);
  });

  it('hides the sidebar in the base and reveals it via .controls.is-active', () => {
    expect(flat).toMatch(/\.controls\s*\{[^}]*display:\s*none/);
    expect(flat).toMatch(/\.controls\.is-active\s*\{[^}]*display:\s*block/);
    expect(flat).toMatch(/\.preview-area\.is-active\s*\{[^}]*display:\s*flex/);
  });

  it('has >=44px touch targets under 640px', () => {
    expect(flat).toContain('@media (max-width: 639.98px)');
    expect(flat).toContain('min-height: 44px');
  });

  it('has visible focus-visible rings using --focus', () => {
    expect(flat).toContain(':focus-visible');
    expect(flat).toContain('outline: 2px solid var(--focus)');
  });

  it('honours prefers-reduced-motion', () => {
    expect(flat).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
