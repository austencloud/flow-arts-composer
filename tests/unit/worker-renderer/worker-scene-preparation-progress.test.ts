import { describe, expect, it } from "vitest";

import { resolveWorkerScenePreparationProgress } from "#lib/shared/3d/worker-renderer/domain/worker-scene-preparation-progress.js";

describe("resolveWorkerScenePreparationProgress", () => {
  it("maps every worker asset phase onto one monotonic asset timeline", () => {
    const samples = [
      resolveWorkerScenePreparationProgress("renderer", 0),
      resolveWorkerScenePreparationProgress("renderer", 1),
      resolveWorkerScenePreparationProgress("assets", 0),
      resolveWorkerScenePreparationProgress("assets", 1),
      resolveWorkerScenePreparationProgress("construct", 1),
      resolveWorkerScenePreparationProgress("performer", 1),
    ];

    expect(samples.map(({ assetProgress }) => assetProgress)).toEqual([
      0, 0.08, 0.08, 0.75, 0.86, 1,
    ]);
    expect(samples.every(({ warmupProgress }) => warmupProgress === 0)).toBe(
      true
    );
  });

  it("keeps assets complete while compile through first-frame fill warm-up", () => {
    const samples = [
      resolveWorkerScenePreparationProgress("compile", 0),
      resolveWorkerScenePreparationProgress("compile", 1),
      resolveWorkerScenePreparationProgress("prime", 1),
      resolveWorkerScenePreparationProgress("finalize", 1),
      resolveWorkerScenePreparationProgress("preflight", 1),
      resolveWorkerScenePreparationProgress("first-frame", 1),
    ];

    expect(samples.every(({ assetProgress }) => assetProgress === 1)).toBe(
      true
    );
    expect(samples.map(({ warmupProgress }) => warmupProgress)).toEqual([
      0, 0.45, 0.75, 0.85, 0.95, 1,
    ]);
  });

  it("clamps worker fractions and completes the atomic handoff", () => {
    expect(resolveWorkerScenePreparationProgress("assets", -1)).toEqual({
      assetProgress: 0.08,
      warmupProgress: 0,
    });
    expect(resolveWorkerScenePreparationProgress("first-frame", 2)).toEqual({
      assetProgress: 1,
      warmupProgress: 1,
    });
    expect(resolveWorkerScenePreparationProgress("handoff", 0)).toEqual({
      assetProgress: 1,
      warmupProgress: 1,
    });
  });

  it("starts safely at zero for service-only and unknown phases", () => {
    expect(resolveWorkerScenePreparationProgress("worker", 0)).toEqual({
      assetProgress: 0,
      warmupProgress: 0,
    });
    expect(resolveWorkerScenePreparationProgress(null, 1)).toEqual({
      assetProgress: 0,
      warmupProgress: 0,
    });
  });
});
