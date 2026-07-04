// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { buildPreviewToolbar } from '../src/ui/preview.js';

function fakeApi() {
  return {
    toggleLayer: vi.fn(),
    setGridVisible: vi.fn(),
    resetView: vi.fn(),
  };
}

describe('buildPreviewToolbar', () => {
  it('renders a .preview-toolbar with layer toggles, a page-grid toggle, and a reset button', () => {
    const api = fakeApi();
    const bar = buildPreviewToolbar(api, {
      layers: [
        { type: 'CUT', label: 'Cuts' },
        { type: 'ENGRAVE', label: 'Engrave' },
      ],
    });
    expect(bar.classList.contains('preview-toolbar')).toBe(true);
    expect(bar.querySelectorAll('.toggle[data-layer]').length).toBe(2);
    expect(bar.querySelector('[data-layer="CUT"]').textContent).toBe('Cuts');
    expect(bar.querySelector('.toggle[data-grid="page"]')).toBeTruthy();
    expect(bar.querySelector('.btn[data-action="reset-view"]')).toBeTruthy();
  });

  it('toggles a layer and flips aria-pressed on click', () => {
    const api = fakeApi();
    const bar = buildPreviewToolbar(api, { layers: [{ type: 'CUT', label: 'Cuts' }] });
    const btn = bar.querySelector('[data-layer="CUT"]');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    btn.click();
    expect(api.toggleLayer).toHaveBeenCalledWith('CUT');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('hides the page grid on the first grid-toggle click', () => {
    const api = fakeApi();
    const bar = buildPreviewToolbar(api, { layers: [] });
    const grid = bar.querySelector('[data-grid="page"]');
    expect(grid.getAttribute('aria-pressed')).toBe('true');
    grid.click();
    expect(api.setGridVisible).toHaveBeenCalledWith(false);
    expect(grid.getAttribute('aria-pressed')).toBe('false');
  });

  it('calls resetView from the reset button', () => {
    const api = fakeApi();
    const bar = buildPreviewToolbar(api, {});
    bar.querySelector('[data-action="reset-view"]').click();
    expect(api.resetView).toHaveBeenCalledTimes(1);
  });
});
