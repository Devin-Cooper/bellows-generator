// @vitest-environment jsdom
// tests/view-switching.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildAppShell } from '../src/ui/appShell.js';

function makeShell() {
  document.body.innerHTML = '';
  const onViewChange = vi.fn();
  const shell = buildAppShell({
    onViewChange,
    onToggleHints: vi.fn(),
    onPreset: vi.fn(),
    initialView: 'flat',
  });
  document.body.appendChild(shell.root);
  // Simulate the caller (state.js) mounting the control panel (.controls) into panelHost.
  const controls = document.createElement('form');
  controls.className = 'controls';
  shell.panelHost.appendChild(controls);
  return { shell, onViewChange, controls };
}

describe('setActiveView drives sidebar + preview visibility (phone segmented bar)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('controls view activates the sidebar and deactivates the preview area', () => {
    const { shell, controls } = makeShell();
    shell.setActiveView('controls');
    expect(controls.classList.contains('is-active')).toBe(true);
    expect(shell.previewArea.classList.contains('is-active')).toBe(false);
    const seg = shell.root.querySelector('.seg-btn[data-view="controls"]');
    expect(seg.classList.contains('is-active')).toBe(true);
    expect(seg.getAttribute('aria-selected')).toBe('true');
  });

  it('flat view activates the flat panel + preview area and clears the sidebar', () => {
    const { shell, controls } = makeShell();
    shell.setActiveView('controls'); // start on controls
    shell.setActiveView('flat');
    expect(controls.classList.contains('is-active')).toBe(false);
    expect(shell.previewArea.classList.contains('is-active')).toBe(true);
    const flat = shell.root.querySelector('.preview-panel[data-view="flat"]');
    const threed = shell.root.querySelector('.preview-panel[data-view="3d"]');
    expect(flat.classList.contains('is-active')).toBe(true);
    expect(threed.classList.contains('is-active')).toBe(false);
    const segFlat = shell.root.querySelector('.seg-btn[data-view="flat"]');
    const tabFlat = shell.root.querySelector('.tab-btn[data-view="flat"]');
    expect(segFlat.classList.contains('is-active')).toBe(true);
    expect(tabFlat.classList.contains('is-active')).toBe(true);
    expect(tabFlat.getAttribute('aria-selected')).toBe('true');
  });

  it('3d view activates the 3d panel and notifies onViewChange', () => {
    const { shell, onViewChange } = makeShell();
    shell.setActiveView('3d');
    const threed = shell.root.querySelector('.preview-panel[data-view="3d"]');
    const flat = shell.root.querySelector('.preview-panel[data-view="flat"]');
    expect(threed.classList.contains('is-active')).toBe(true);
    expect(flat.classList.contains('is-active')).toBe(false);
    expect(shell.previewArea.classList.contains('is-active')).toBe(true);
    expect(onViewChange).toHaveBeenLastCalledWith('3d');
  });

  it('switching to controls does not clear the previously active preview panel', () => {
    const { shell } = makeShell();
    shell.setActiveView('3d');
    shell.setActiveView('controls');
    // The 3d panel keeps its is-active so desktop (>=640, no segmented bar) still shows a preview.
    const threed = shell.root.querySelector('.preview-panel[data-view="3d"]');
    expect(threed.classList.contains('is-active')).toBe(true);
    // But the preview area is hidden on phone while the sidebar is up.
    expect(shell.previewArea.classList.contains('is-active')).toBe(false);
  });
});
