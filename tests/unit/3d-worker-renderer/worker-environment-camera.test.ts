import { describe, expect, it } from "vitest";
import { getWorkerEnvironmentCamera } from "#lib/shared/3d/worker-renderer/domain/worker-environment-camera.js";

describe("worker environment camera", () => {
  it.each([
    "ocean",
    "rainbow",
    "void",
    "winter",
    "celestial",
    "cosmic",
    "forest",
    "blossom",
    "autumn",
    "ember",
  ] as const)("provides a finite complete %s snapshot", (environment) => {
    const snapshot = getWorkerEnvironmentCamera(environment);
    expect(
      [...snapshot.position, ...snapshot.target, snapshot.fov].every(
        Number.isFinite
      )
    ).toBe(true);
    expect(snapshot.fov).toBeGreaterThan(0);
  });
});
