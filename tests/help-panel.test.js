// @vitest-environment jsdom
// tests/help-panel.test.js
import { describe, it, expect } from 'vitest';
import {
  helpPanelHTML,
  fillHelpPanel,
  wireHelpToggle,
  LASER_LEGEND,
} from '../src/ui/appShell.js';

describe('help panel content', () => {
  it('includes a one-line what-this-is lede', () => {
    const html = helpPanelHTML();
    expect(html).toContain('What this is');
    expect(html).toMatch(/camera bellows/i);
  });

  it('lists the 4-step quickstart in order', () => {
    const el = document.createElement('div');
    fillHelpPanel(el);
    const steps = [...el.querySelectorAll('.help-quickstart li')].map((li) => li.textContent);
    expect(steps.length).toBe(4);
    expect(steps[0]).toMatch(/A6/);
    expect(steps[1]).toMatch(/[Tt]weak/);
    expect(steps[2]).toMatch(/Flat/);
    expect(steps[2]).toMatch(/3D/);
    expect(steps[3]).toMatch(/[Ee]xport/);
  });

  it('renders the full laser colour->operation legend', () => {
    const el = document.createElement('div');
    fillHelpPanel(el);
    const text = el.querySelector('.help-legend').textContent;
    for (const l of LASER_LEGEND) {
      expect(text).toContain(l.name);
      expect(text.toUpperCase()).toContain(l.color.toUpperCase());
      expect(text).toContain(l.op);
    }
    expect(LASER_LEGEND.map((l) => `${l.name} ${l.color} ${l.op}`)).toEqual([
      'CUT #FF0000 cut',
      'GLUE_TAB #FF00FF cut',
      'FOLD_MOUNTAIN #0000FF score',
      'FOLD_VALLEY #00AA00 score',
      'ENGRAVE #000000 engrave',
    ]);
  });

  it('states the paper-fold-test and tapered-experimental caveats', () => {
    const el = document.createElement('div');
    fillHelpPanel(el);
    const caveats = el.querySelector('.help-caveats').textContent;
    expect(caveats).toMatch(/paper fold-test/i);
    expect(caveats).toMatch(/tapered/i);
    expect(caveats).toMatch(/experimental/i);
  });
});

describe('help panel toggle', () => {
  it('opens and closes the panel via its toggle button and reflects aria-expanded', () => {
    const button = document.createElement('button');
    const panel = document.createElement('div');
    panel.className = 'help-panel';
    wireHelpToggle(button, panel);
    expect(panel.classList.contains('is-open')).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    button.dispatchEvent(new Event('click'));
    expect(panel.classList.contains('is-open')).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    button.dispatchEvent(new Event('click'));
    expect(panel.classList.contains('is-open')).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });
});
