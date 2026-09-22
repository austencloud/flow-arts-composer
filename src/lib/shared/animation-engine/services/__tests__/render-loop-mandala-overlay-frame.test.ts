import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AnimationRenderLoop } from "../animation-render-loop";
import type { RenderLoopConfig } from "../IAnimationRenderLoop";
import type { MandalaOverlayCanvas } from "$lib/shared/mandala/services/mandala-overlay-canvas";

// Regression guard for the "Shape Engine mandala is much bigger than the trail"
// bug.
//
// The mandala overlay is created lazily by the lifecycle manager, and the
// visibility subscription that creates it fires during initialization — before
// the resizer exists. The overlay therefore falls back to the 500px default
// square. The render loop is then initialized with the REAL frame (891px on a
// large stage) and handed that 500px overlay, but only `updateConfig` resized
// the overlay, and only on a frame CHANGE. The initial frame never changes, so
// the guide was painted at the 891px scale into a 500px canvas that CSS then
// stretched by 891/500: the mandala drew 1.8x the path the prop traced.
//
// The loop owns "the overlay follows the frame", so it must apply that when
// the overlay is first attached, not only when the frame later moves.
describe("AnimationRenderLoop mandala overlay frame adoption", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1)
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeOverlay() {
    return {
      resize: vi.fn(),
      clear: vi.fn(),
      setVisible: vi.fn(),
      renderFrame: vi.fn(),
      dispose: vi.fn(),
    } as unknown as MandalaOverlayCanvas & { resize: ReturnType<typeof vi.fn> };
  }

  const frame = { size: 891, width: 891, height: 1020 };

  it("initialize() sizes an already-created overlay to the initial frame", () => {
    const overlay = makeOverlay();
    const loop = new AnimationRenderLoop();
    loop.initialize({
      renderer: {},
      canvasSize: frame.size,
      canvasFrame: frame,
      mandalaOverlay: overlay,
    } as unknown as RenderLoopConfig);

    expect(overlay.resize).toHaveBeenCalledWith(891, 1020);
  });

  it("initialize() without an explicit frame sizes the overlay to the square", () => {
    const overlay = makeOverlay();
    const loop = new AnimationRenderLoop();
    loop.initialize({
      renderer: {},
      canvasSize: 720,
      mandalaOverlay: overlay,
    } as unknown as RenderLoopConfig);

    expect(overlay.resize).toHaveBeenCalledWith(720, 720);
  });

  it("updateConfig() sizes an overlay attached after initialization to the current frame", () => {
    const loop = new AnimationRenderLoop();
    loop.initialize({
      renderer: {},
      canvasSize: frame.size,
      canvasFrame: frame,
    } as unknown as RenderLoopConfig);

    const overlay = makeOverlay();
    loop.updateConfig({ mandalaOverlay: overlay });

    expect(overlay.resize).toHaveBeenCalledWith(891, 1020);
  });

  it("updateConfig() with an unchanged frame does not resize the attached overlay again", () => {
    const overlay = makeOverlay();
    const loop = new AnimationRenderLoop();
    loop.initialize({
      renderer: {},
      canvasSize: frame.size,
      canvasFrame: frame,
      mandalaOverlay: overlay,
    } as unknown as RenderLoopConfig);
    overlay.resize.mockClear();

    loop.updateConfig({ canvasSize: frame.size, canvasFrame: { ...frame } });

    expect(overlay.resize).not.toHaveBeenCalled();
  });
});
