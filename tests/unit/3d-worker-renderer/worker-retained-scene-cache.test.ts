import { describe, expect, it, vi } from "vitest";
import { WorkerRetainedSceneCache } from "$lib/shared/3d/worker-renderer/services/worker-retained-scene-cache";

function retainedScene(
  environment: string,
  estimatedBytes: number,
  reducedMotion = false
) {
  return { environment, estimatedBytes, reducedMotion, dispose: vi.fn() };
}

describe("worker retained scene cache", () => {
  it("returns a compatible scene without disposing its prepared runtime", () => {
    const cache = new WorkerRetainedSceneCache(100);
    const scene = retainedScene("ocean", 80);

    expect(cache.retain(scene)).toBe(true);
    expect(cache.count).toBe(1);
    expect(cache.retainedBytes).toBe(80);
    expect(cache.take("ocean", false)).toBe(scene);
    expect(scene.dispose).not.toHaveBeenCalled();
    expect(cache.count).toBe(0);
    expect(cache.take("ocean", false)).toBeNull();
  });

  it("disposes a prior entry when a newer inactive scene takes its place", () => {
    const cache = new WorkerRetainedSceneCache(100);
    const first = retainedScene("ocean", 80);
    const second = retainedScene("rainbow", 60);

    cache.retain(first);
    cache.retain(second);

    expect(first.dispose).toHaveBeenCalledOnce();
    expect(cache.take("rainbow", false)).toBe(second);
  });

  it("rejects an oversized scene and frees it immediately", () => {
    const cache = new WorkerRetainedSceneCache(100);
    const oversized = retainedScene("ocean", 101);

    expect(cache.retain(oversized)).toBe(false);
    expect(oversized.dispose).toHaveBeenCalledOnce();
    expect(cache.lastCandidateBytes).toBe(101);
    expect(cache.lastSkipReason).toBe("estimated runtime exceeds cache budget");
    expect(cache.take("ocean", false)).toBeNull();
  });

  it("reports an unmeasurable allocation instead of retaining it", () => {
    const cache = new WorkerRetainedSceneCache(100);
    const unknown = {
      ...retainedScene("ocean", 80),
      cacheSkipReason: "texture dimensions are unavailable (Texture)",
    };

    expect(cache.retain(unknown)).toBe(false);
    expect(unknown.dispose).toHaveBeenCalledOnce();
    expect(cache.lastSkipReason).toBe(
      "texture dimensions are unavailable (Texture)"
    );
  });

  it("disposes a cached scene when its motion configuration is stale", () => {
    const cache = new WorkerRetainedSceneCache(100);
    const scene = retainedScene("ocean", 80, false);
    cache.retain(scene);

    expect(cache.take("ocean", true)).toBeNull();
    expect(scene.dispose).toHaveBeenCalledOnce();
  });

  it("releases its entry when the renderer context is discarded", () => {
    const cache = new WorkerRetainedSceneCache(100);
    const scene = retainedScene("ocean", 80);
    cache.retain(scene);

    cache.clear();

    expect(scene.dispose).toHaveBeenCalledOnce();
  });
});
