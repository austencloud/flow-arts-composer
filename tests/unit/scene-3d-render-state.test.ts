import { describe, it, expect, vi } from "vitest";

vi.mock("#lib/shared/3d/undo/get-scene-undo-manager.js", () => ({
  getSceneUndoManager: () => ({
    registerDomain: vi.fn(),
    captureState: vi.fn(),
    commitStateCoalescing: vi.fn(),
  }),
}));

import { createScene3DRenderState } from "../../src/lib/shared/3d/scene-features/state/scene-3d-render-state.svelte";

describe("scene-3d-render-state", () => {
  it("defaults motion to disabled with intensity 0.5", () => {
    const s = createScene3DRenderState();
    expect(s.motion.blur).toBe(false);
    expect(s.motion.speedLines).toBe(false);
    expect(s.motion.intensity).toBeCloseTo(0.5);
  });

  it("toggles blur independently of speedLines", () => {
    const s = createScene3DRenderState();
    s.updateMotion({ blur: true });
    expect(s.motion.blur).toBe(true);
    expect(s.motion.speedLines).toBe(false);

    s.updateMotion({ speedLines: true });
    expect(s.motion.blur).toBe(true);
    expect(s.motion.speedLines).toBe(true);
  });

  it("clamps intensity to [0, 1]", () => {
    const s = createScene3DRenderState();
    s.updateMotion({ intensity: 1.5 });
    expect(s.motion.intensity).toBe(1);
    s.updateMotion({ intensity: -0.2 });
    expect(s.motion.intensity).toBe(0);
  });

  it("round-trips through replace()", () => {
    const s = createScene3DRenderState();
    s.replace({ motion: { blur: true, speedLines: true, intensity: 0.8 } });
    expect(s.motion).toEqual({ blur: true, speedLines: true, intensity: 0.8 });
  });

  it("accepts an initial config in the factory", () => {
    const s = createScene3DRenderState({
      motion: { blur: true, speedLines: false, intensity: 0.3 },
    });
    expect(s.motion.blur).toBe(true);
    expect(s.motion.intensity).toBeCloseTo(0.3);
  });
});
