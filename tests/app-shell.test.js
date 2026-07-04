// @vitest-environment jsdom
// tests/app-shell.test.js
import { describe, it, expect, vi } from 'vitest';
import { buildAppShell } from '../src/ui/appShell.js';

describe('buildAppShell', () => {
  it('builds header, preview tabs, phone segmented bar, and help panel', () => {
    const shell = buildAppShell({});
    const { root } = shell;

    // Header
    expect(root.querySelector('.app-header')).toBeTruthy();
    expect(root.querySelector('.app-title').textContent).toBe('Bellows Generator');
    expect(root.querySelector('.header-actions [data-preset="A6"]')).toBeTruthy();
    expect(root.querySelector('.header-actions [data-preset="Default"]')).toBeTruthy();
    const hints = root.querySelector('.toggle[data-role="hints-toggle"]');
    expect(hints).toBeTruthy();
    expect(root.querySelector('[data-role="help-toggle"]')).toBeTruthy();

    // Preview tabs (role=tablist with two role=tab buttons)
    const tabs = root.querySelector('.preview-tabs');
    expect(tabs.getAttribute('role')).toBe('tablist');
    const tabBtns = tabs.querySelectorAll('.tab-btn');
    expect(tabBtns.length).toBe(2);
    expect([...tabBtns].map((b) => b.dataset.view)).toEqual(['flat', '3d']);
    expect(tabBtns[0].getAttribute('role')).toBe('tab');

    // Preview panels + hosts + slider
    expect(root.querySelector('.preview-panel[data-view="flat"]').getAttribute('role')).toBe('tabpanel');
    expect(shell.svgHost.classList.contains('flat-preview')).toBe(true);
    expect(shell.canvas.classList.contains('three-canvas')).toBe(true);
    expect(shell.slider.type).toBe('range');

    // Phone segmented bar (Controls/Flat/3D)
    const seg = root.querySelector('.segmented-bar');
    expect(seg.getAttribute('role')).toBe('tablist');
    expect([...seg.querySelectorAll('.seg-btn')].map((b) => b.dataset.view)).toEqual([
      'controls', 'flat', '3d',
    ]);

    // Help panel present + closed by default
    expect(shell.helpPanel.classList.contains('help-panel')).toBe(true);
    expect(shell.helpPanel.classList.contains('is-open')).toBe(false);
  });

  it('defaults activeView to flat and marks flat tab/panel active', () => {
    const { root } = buildAppShell({});
    expect(root.querySelector('.tab-btn[data-view="flat"]').classList.contains('is-active')).toBe(true);
    expect(root.querySelector('.tab-btn[data-view="flat"]').getAttribute('aria-selected')).toBe('true');
    expect(root.querySelector('.preview-panel[data-view="flat"]').classList.contains('is-active')).toBe(true);
    expect(root.querySelector('.tab-btn[data-view="3d"]').classList.contains('is-active')).toBe(false);
  });

  it('setActiveView toggles .is-active/aria-selected and calls onViewChange', () => {
    const onViewChange = vi.fn();
    const shell = buildAppShell({ onViewChange });
    shell.setActiveView('3d');
    expect(onViewChange).toHaveBeenCalledWith('3d');
    expect(shell.root.querySelector('.tab-btn[data-view="3d"]').classList.contains('is-active')).toBe(true);
    expect(shell.root.querySelector('.tab-btn[data-view="3d"]').getAttribute('aria-selected')).toBe('true');
    expect(shell.root.querySelector('.preview-panel[data-view="3d"]').classList.contains('is-active')).toBe(true);
    expect(shell.root.querySelector('.tab-btn[data-view="flat"]').getAttribute('aria-selected')).toBe('false');
  });

  it('does not re-fire onViewChange when the view is unchanged', () => {
    const onViewChange = vi.fn();
    const shell = buildAppShell({ onViewChange, initialView: 'flat' });
    shell.setActiveView('flat');
    expect(onViewChange).not.toHaveBeenCalled();
  });

  it('clicking a tab button switches the active view', () => {
    const onViewChange = vi.fn();
    const shell = buildAppShell({ onViewChange });
    shell.root.querySelector('.tab-btn[data-view="3d"]').click();
    expect(onViewChange).toHaveBeenCalledWith('3d');
    expect(shell.root.querySelector('.preview-panel[data-view="3d"]').classList.contains('is-active')).toBe(true);
  });

  it('preset buttons call onPreset with their name', () => {
    const onPreset = vi.fn();
    const shell = buildAppShell({ onPreset });
    shell.root.querySelector('[data-preset="A6"]').click();
    shell.root.querySelector('[data-preset="Default"]').click();
    expect(onPreset).toHaveBeenNthCalledWith(1, 'A6');
    expect(onPreset).toHaveBeenNthCalledWith(2, 'Default');
  });

  it('the hints toggle flips aria-pressed and calls onToggleHints', () => {
    const onToggleHints = vi.fn();
    const shell = buildAppShell({ onToggleHints });
    const hints = shell.root.querySelector('[data-role="hints-toggle"]');
    expect(hints.getAttribute('aria-pressed')).toBe('true');
    hints.click();
    expect(hints.getAttribute('aria-pressed')).toBe('false');
    expect(onToggleHints).toHaveBeenCalledWith(false);
  });

  it('setHintsOn reflects state on the toggle button', () => {
    const shell = buildAppShell({});
    shell.setHintsOn(false);
    const hints = shell.root.querySelector('[data-role="hints-toggle"]');
    expect(hints.getAttribute('aria-pressed')).toBe('false');
    shell.setHintsOn(true);
    expect(hints.getAttribute('aria-pressed')).toBe('true');
  });

  it('the help button toggles .is-open on the help panel', () => {
    const shell = buildAppShell({});
    const helpBtn = shell.root.querySelector('[data-role="help-toggle"]');
    expect(shell.helpPanel.classList.contains('is-open')).toBe(false);
    helpBtn.click();
    expect(shell.helpPanel.classList.contains('is-open')).toBe(true);
    expect(helpBtn.getAttribute('aria-expanded')).toBe('true');
    helpBtn.click();
    expect(shell.helpPanel.classList.contains('is-open')).toBe(false);
  });
});
