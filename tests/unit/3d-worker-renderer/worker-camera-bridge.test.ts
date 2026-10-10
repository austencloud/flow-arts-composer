import { describe, expect, it } from "vitest";

import {
  toViewerCameraSnapshot,
  toWorkerCameraSnapshot,
} from "#lib/shared/3d/worker-renderer/domain/worker-camera-bridge.js";

describe("worker camera bridge", () => {
  const fallback = {
    position: [0, 4, 17] as const,
    target: [0, 1, -1] as const,
    fov: 48,
  };

  it("preserves the legacy camera pose at the worker boundary", () => {
    const worker = toWorkerCameraSnapshot(
      {
        position: { x: 3, y: 5, z: 11 },
        rotation: { x: 0.1, y: -0.2, z: 0.3 },
        target: { x: 1, y: 2, z: -4 },
        fov: 57,
        timestamp: 1,
      },
      fallback
    );

    expect(worker.position).toEqual([3, 5, 11]);
    expect(worker.target).toEqual([1, 2, -4]);
    expect(worker.fov).toBe(57);
    expect(worker.quaternion).toHaveLength(4);

    const restored = toViewerCameraSnapshot(worker, 99);
    expect(restored.position).toEqual({ x: 3, y: 5, z: 11 });
    expect(restored.target).toEqual({ x: 1, y: 2, z: -4 });
    expect(restored.fov).toBe(57);
    expect(restored.timestamp).toBe(99);
    expect(restored.rotation.x).toBeCloseTo(0.1);
    expect(restored.rotation.y).toBeCloseTo(-0.2);
    expect(restored.rotation.z).toBeCloseTo(0.3);
  });

  it("uses the environment camera when no viewer pose exists", () => {
    expect(toWorkerCameraSnapshot(null, fallback)).toBe(fallback);
  });

  it("rejects a corrupt persisted pose instead of poisoning the worker camera", () => {
    const corrupt = {
      position: { x: Number.NaN, y: 5, z: 11 },
      rotation: { x: 0, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 0 },
      fov: 57,
      timestamp: 1,
    };

    expect(toWorkerCameraSnapshot(corrupt, fallback)).toBe(fallback);
  });

  it("rejects a pose inside OrbitControls' minimum radius", () => {
    const tooClose = {
      position: { x: 0, y: 0, z: 0.5 },
      rotation: { x: 0, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 0 },
      fov: 57,
      timestamp: 1,
    };

    expect(toWorkerCameraSnapshot(tooClose, fallback)).toBe(fallback);
  });
});
