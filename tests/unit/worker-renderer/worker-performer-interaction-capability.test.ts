import { describe, expect, it } from "vitest";

import { assessWorkerPerformerInteractionCapability } from "#lib/shared/3d/worker-renderer/services/worker-performer-interaction-capability.js";

const camera = {
  position: [0, 2, 8] as const,
  target: [0, 1, 0] as const,
  fov: 50,
};

function supportedInput() {
  return {
    camera,
    cameraArbitrationAvailable: true,
    surfaceWidth: 100,
    surfaceHeight: 100,
    pointerCaptureAvailable: true,
    groundY: 0,
    stageBounds: { width: 10, depth: 8, zOffset: 0 },
    performers: [
      {
        index: 0,
        position: { x: 0, z: 0 },
        badgeVisible: true,
        badgeWorldY: 2.1,
      },
    ],
    viewerPerformerCount: 1,
    requireRenderedSurfaceAnchors: false,
  };
}

describe("worker performer interaction capability", () => {
  it("accepts the complete canonical proxy interaction contract", () => {
    expect(
      assessWorkerPerformerInteractionCapability(supportedInput())
    ).toEqual({ supported: true });
  });

  it("fails closed instead of approximating a deforming rendered surface", () => {
    expect(
      assessWorkerPerformerInteractionCapability({
        ...supportedInput(),
        requireRenderedSurfaceAnchors: true,
      })
    ).toEqual({
      supported: false,
      blockers: ["rendered-surface-anchor-unavailable"],
    });
  });

  it("reports every missing prerequisite without hiding later blockers", () => {
    expect(
      assessWorkerPerformerInteractionCapability({
        ...supportedInput(),
        camera: { ...camera, fov: Number.NaN },
        cameraArbitrationAvailable: false,
        surfaceWidth: 0,
        pointerCaptureAvailable: false,
        groundY: Number.NaN,
        stageBounds: { width: -1, depth: 0 },
        viewerPerformerCount: 0,
        performers: [
          {
            index: 0,
            position: { x: Number.NaN, z: 0 },
            badgeVisible: true,
          },
          { index: 0, position: { x: 0, z: 0 } },
        ],
      })
    ).toEqual({
      supported: false,
      blockers: [
        "camera-invalid",
        "camera-arbitration-unavailable",
        "interaction-surface-unavailable",
        "pointer-capture-unavailable",
        "ground-height-invalid",
        "stage-bounds-invalid",
        "performer-index-invalid",
        "performer-position-invalid",
        "badge-pick-target-unavailable",
      ],
    });
  });
});
