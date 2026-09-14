import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Mesh, MeshBasicMaterial, PerspectiveCamera, Scene } from "three";
import { warmupRenderer } from "$lib/shared/3d/scene-boot/renderer-warmup";

describe("warmupRenderer", () => {
  it("compiles hidden effect materials and restores their live visibility", async () => {
    const scene = new Scene();
    const hiddenEffect = new Mesh(undefined, new MeshBasicMaterial());
    hiddenEffect.visible = false;
    const equivalentEffect = new Mesh(undefined, new MeshBasicMaterial());
    equivalentEffect.visible = false;
    scene.add(hiddenEffect, equivalentEffect);
    const compileAsync = vi.fn(async (object: Mesh) => {
      expect(object.visible).toBe(true);
    });

    await warmupRenderer({
      renderer: { compileAsync } as never,
      scene,
      camera: new PerspectiveCamera(),
    });

    expect(compileAsync).toHaveBeenCalledWith(
      hiddenEffect,
      expect.any(PerspectiveCamera),
      scene
    );
    expect(compileAsync).toHaveBeenCalledTimes(1);
    expect(hiddenEffect.visible).toBe(false);
    expect(equivalentEffect.visible).toBe(false);
  });
  it("abandons a compile that never settles instead of wedging boot forever", async () => {
    // three's compileAsync resolves by polling currentProgram.isReady() from a
    // timer. When a material is disposed mid-poll — which Threlte's refcounted
    // disposal context does whenever a scene regrades materials after its GLB
    // lands — that poll throws out of the timer and the promise never settles.
    // Awaiting it unguarded left the ember scene hung with the curtain up.
    vi.useFakeTimers();
    try {
      const scene = new Scene();
      const wedged = new Mesh(undefined, new MeshBasicMaterial());
      scene.add(wedged);

      const progress: number[] = [];
      const settled = vi.fn();
      warmupRenderer(
        {
          renderer: { compileAsync: () => new Promise(() => {}) } as never,
          scene,
          camera: new PerspectiveCamera(),
        },
        { onProgress: (fraction) => progress.push(fraction) }
      ).then(settled);

      await vi.advanceTimersByTimeAsync(60_000);

      expect(settled).toHaveBeenCalled();
      expect(progress.at(-1)).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
