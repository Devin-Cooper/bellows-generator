// tests/export-download.test.js
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { wireExportButtons, triggerDownload } from '../src/export/download.js';

const params = {
  rib: 12,
  gap: 2.5,
  frontW: 150,
  cornerAllowance: 15,
  ribThickness: 0.4,
};

function makeModel() {
  return {
    segments: [],
    regions: [],
    seamFaceIndex: 0,
    bounds: { w: 100, h: 100 },
    metrics: { ribCount: 3 },
  };
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:mock');
  URL.revokeObjectURL = vi.fn();
});

describe('download wiring', () => {
  it('triggerDownload creates a Blob URL and returns the filename', () => {
    const name = triggerDownload(new Uint8Array([1, 2, 3]), 'x.bin', 'application/octet-stream');
    expect(name).toBe('x.bin');
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('wireExportButtons appends the STL export button', () => {
    const container = document.createElement('div');
    const { stlBtn } = wireExportButtons(container, makeModel, () => params);
    expect(container.querySelectorAll('button').length).toBe(1);
    expect(stlBtn.textContent).toBe('Export Rib STL');
  });

  it('clicking the STL button triggers a download', () => {
    const container = document.createElement('div');
    const { stlBtn } = wireExportButtons(container, makeModel, () => params);
    stlBtn.click();
    expect(URL.createObjectURL).toHaveBeenCalled();
  });
});
