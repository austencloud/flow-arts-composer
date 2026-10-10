import { describe, expect, it, vi } from "vitest";
import { AnimationRenderLoop } from "#lib/shared/animation-engine/services/animation-render-loop.js";
import type { MandalaOverlayCanvas } from "#lib/shared/mandala/services/mandala-overlay-canvas.js";

describe("AnimationRenderLoop mandala attachment", () => {
  it("sizes a lazily attached guide to the already-measured render frame", () => {
    const loop = new AnimationRenderLoop();
    const resize = vi.fn();
    const overlay = { resize } as unknown as MandalaOverlayCanvas;

    loop.updateConfig({
      canvasSize: 784,
      canvasFrame: { size: 784, width: 784, height: 785 },
    });
    resize.mockClear();

    loop.updateConfig({ mandalaOverlay: overlay });

    expect(resize).toHaveBeenCalledOnce();
    expect(resize).toHaveBeenCalledWith(784, 785);
  });
});
