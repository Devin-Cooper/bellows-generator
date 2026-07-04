import { describe, it, expect, vi } from 'vitest';
import { BellowsViewer } from '../src/render/three.js';

function stubContext(clientWidth, clientHeight) {
  return {
    canvas: { clientWidth, clientHeight },
    renderer: { setSize: vi.fn(), render: vi.fn() },
    camera: { aspect: 1, updateProjectionMatrix: vi.fn() },
    scene: { id: 'scene' },
  };
}

describe('BellowsViewer.resize', () => {
  it('re-reads the canvas client size and updates renderer + camera', () => {
    const ctx = stubContext(800, 600);
    BellowsViewer.prototype.resize.call(ctx);
    expect(ctx.renderer.setSize).toHaveBeenCalledWith(800, 600, false);
    expect(ctx.camera.aspect).toBeCloseTo(800 / 600, 5);
    expect(ctx.camera.updateProjectionMatrix).toHaveBeenCalledTimes(1);
    expect(ctx.renderer.render).toHaveBeenCalledWith(ctx.scene, ctx.camera);
  });

  it('falls back to 640x480 when the canvas reports zero size (hidden tab)', () => {
    const ctx = stubContext(0, 0);
    BellowsViewer.prototype.resize.call(ctx);
    expect(ctx.renderer.setSize).toHaveBeenCalledWith(640, 480, false);
    expect(ctx.camera.aspect).toBeCloseTo(640 / 480, 5);
  });
});
