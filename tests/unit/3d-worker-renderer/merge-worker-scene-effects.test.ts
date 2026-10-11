import { describe, expect, it } from "vitest";

import { mergeWorkerSceneEffects } from "#lib/shared/3d/worker-renderer/effects/merge-worker-scene-effects.js";
import type { WorkerSceneEffectsSnapshot } from "#lib/shared/3d/worker-renderer/domain/worker-renderer-protocol.js";

describe("mergeWorkerSceneEffects", () => {
  it("preserves scene-global and performer-owned renderer inputs", () => {
    const external = {
      playing: false,
      sources: [{ id: "scene" }],
      imperative: [{ sourceId: "scene-imperative" }],
    } as unknown as WorkerSceneEffectsSnapshot;
    const performer = {
      playing: true,
      sources: [{ id: "performer" }],
      imperative: [{ sourceId: "performer-imperative" }],
    } as unknown as WorkerSceneEffectsSnapshot;

    const merged = mergeWorkerSceneEffects(external, performer);

    expect(merged.playing).toBe(true);
    expect(merged.sources).toEqual([
      { id: "scene" },
      { id: "performer" },
    ]);
    expect(merged.imperative).toEqual([
      { sourceId: "scene-imperative" },
      { sourceId: "performer-imperative" },
    ]);
  });

  it("passes through scene effects when the performer stage is absent", () => {
    const external = {
      playing: false,
      sources: [],
    } as WorkerSceneEffectsSnapshot;

    expect(mergeWorkerSceneEffects(external, null)).toBe(external);
  });
});
