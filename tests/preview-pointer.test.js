// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { mountPreview } from '../src/ui/preview.js';

const previewOptions = () => ({
  patternSVG: '<svg id="pattern"><g inkscape:label="CUT"></g></svg>',
  model: { bounds: { w: 360, h: 200 } },
  params: { bedW: 609.6, bedH: 406.4 },
});

/** Build a bare pointer event with the fields mountPreview reads. */
function pointer(type, { id = 1, x = 0, y = 0, t = 0 } = {}) {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  ev.pointerId = id;
  ev.clientX = x;
  ev.clientY = y;
  Object.defineProperty(ev, 'timeStamp', { value: t, configurable: true });
  return ev;
}

describe('mountPreview pointer interaction', () => {
  let el;
  beforeEach(() => {
    el = document.createElement('div');
    document.body.appendChild(el);
  });

  it('pans on a single-pointer drag', () => {
    const api = mountPreview(el, previewOptions());
    el.dispatchEvent(pointer('pointerdown', { id: 1, x: 10, y: 20 }));
    el.dispatchEvent(pointer('pointermove', { id: 1, x: 30, y: 25 }));
    expect(api.getState()).toMatchObject({ panX: 20, panY: 5, zoom: 1 });
  });

  it('pinch-zooms by the distance ratio about the midpoint', () => {
    const api = mountPreview(el, previewOptions());
    // two fingers 100px apart on the x-axis
    el.dispatchEvent(pointer('pointerdown', { id: 1, x: 0, y: 0 }));
    el.dispatchEvent(pointer('pointerdown', { id: 2, x: 100, y: 0 }));
    // spread finger 2 to 200px apart -> ratio 2
    el.dispatchEvent(pointer('pointermove', { id: 2, x: 200, y: 0 }));
    const s = api.getState();
    expect(s.zoom).toBeCloseTo(2, 6);
    // midpoint = (0+200)/2 = 100 (rect.left is 0 in jsdom); pan re-anchors:
    // panX = 100 - (100 - 0) * 2 = -100
    expect(s.panX).toBeCloseTo(-100, 6);
    expect(s.panY).toBeCloseTo(0, 6);
  });

  it('clamps pinch zoom to the 0.1..20 range', () => {
    const api = mountPreview(el, previewOptions());
    api.setZoom(19);
    el.dispatchEvent(pointer('pointerdown', { id: 1, x: 0, y: 0 }));
    el.dispatchEvent(pointer('pointerdown', { id: 2, x: 10, y: 0 }));
    el.dispatchEvent(pointer('pointermove', { id: 2, x: 1000, y: 0 }));
    expect(api.getState().zoom).toBe(20);
  });

  it('resets zoom/pan on a double-tap', () => {
    const api = mountPreview(el, previewOptions());
    api.setZoom(3);
    api.setPan(50, 50);
    el.dispatchEvent(pointer('pointerdown', { id: 1, x: 5, y: 5 }));
    el.dispatchEvent(pointer('pointerup', { id: 1, x: 5, y: 5, t: 0 }));
    el.dispatchEvent(pointer('pointerdown', { id: 1, x: 5, y: 5 }));
    el.dispatchEvent(pointer('pointerup', { id: 1, x: 5, y: 5, t: 120 }));
    expect(api.getState()).toMatchObject({ zoom: 1, panX: 0, panY: 0 });
  });

  it('resets on a dblclick and exposes resetView()', () => {
    const api = mountPreview(el, previewOptions());
    api.setZoom(4);
    api.setPan(9, 9);
    el.dispatchEvent(new Event('dblclick', { bubbles: true }));
    expect(api.getState()).toMatchObject({ zoom: 1, panX: 0, panY: 0 });
    api.setZoom(2);
    api.resetView();
    expect(api.getState().zoom).toBe(1);
  });

  it('stops handling pointers after destroy (listeners aborted)', () => {
    const api = mountPreview(el, previewOptions());
    api.destroy();
    el.dispatchEvent(pointer('pointerdown', { id: 1, x: 0, y: 0 }));
    el.dispatchEvent(pointer('pointermove', { id: 1, x: 40, y: 40 }));
    expect(api.getState()).toMatchObject({ panX: 0, panY: 0 });
  });
});
