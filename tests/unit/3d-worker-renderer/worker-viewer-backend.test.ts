import { BackgroundType } from "@austencloud/backgrounds";
import { describe, expect, it } from "vitest";
import { SceneEnvironmentId } from "#lib/shared/3d/environments/domain/scene-environment.js";
import {
  MIGRATED_WORKER_ENVIRONMENTS,
  WORKER_ENVIRONMENT_BY_BACKGROUND,
  createWorkerViewerCapabilitySnapshot,
  decideWorkerViewerBackend,
  getWorkerEnvironmentKey,
  type WorkerViewerBackendInput,
} from "#lib/shared/3d/worker-renderer/domain/worker-viewer-backend.js";

function supported(
  overrides: Partial<WorkerViewerBackendInput> = {}
): WorkerViewerBackendInput {
  return {
    environmentId: SceneEnvironmentId.OCEAN,
    conditions: {
      offscreenCanvasAvailable: true,
      visibleSceneMarkerCount: 0,
      visibleAudienceMemberCount: 0,
      worldChildCount: 0,
      retainedEnvironmentCount: 0,
      cameraMode: "orbit",
      captureInProgress: false,
      rendererHandleConsumerCount: 0,
    },
    features: {
      performerPropsSupported: true,
      locomotionActive: false,
      effectSourceCount: 0,
    },
    ...overrides,
  };
}

describe("worker viewer backend", () => {
  it("catalogs every production background explicitly", () => {
    expect(Object.keys(WORKER_ENVIRONMENT_BY_BACKGROUND).sort()).toEqual(
      Object.values(BackgroundType).sort()
    );
    expect([...MIGRATED_WORKER_ENVIRONMENTS].sort()).toEqual([
      "autumn",
      "blossom",
      "celestial",
      "cosmic",
      "ember",
      "forest",
      "ocean",
      "rainbow",
      "void",
      "winter",
    ]);
    expect(getWorkerEnvironmentKey(SceneEnvironmentId.RAINBOW)).toBe("rainbow");
    expect(getWorkerEnvironmentKey(SceneEnvironmentId.AUTUMN)).toBe("autumn");
    expect(getWorkerEnvironmentKey(SceneEnvironmentId.EMBER)).toBe("ember");
  });

  it("selects a migrated complete frame", () => {
    expect(decideWorkerViewerBackend(supported())).toEqual({
      backend: "worker",
      environment: "ocean",
      fallbackReasons: [],
    });
  });

  it("derives capability flags from things that are actually present", () => {
    const snapshot = createWorkerViewerCapabilitySnapshot(
      supported({
        conditions: {
          ...supported().conditions,
          visibleSceneMarkerCount: 2,
          visibleAudienceMemberCount: 4,
          worldChildCount: 1,
          retainedEnvironmentCount: 1,
          rendererHandleConsumerCount: 1,
        },
        features: {
          performerPropsSupported: true,
          locomotionActive: false,
          effectSourceCount: 3,
        },
      })
    );

    expect(snapshot).toMatchObject({
      effectsActive: true,
      sceneMarkersVisible: true,
      audienceVisible: true,
      hasWorldChildren: true,
      retainsEnvironments: true,
      requiresRendererHandle: true,
    });
  });

  it("fails closed with every exact reason instead of dropping content", () => {
    const decision = decideWorkerViewerBackend(
      supported({
        environmentId: SceneEnvironmentId.EMBER,
        conditions: {
          offscreenCanvasAvailable: false,
          visibleSceneMarkerCount: 1,
          visibleAudienceMemberCount: 1,
          worldChildCount: 1,
          retainedEnvironmentCount: 1,
          cameraMode: "walk",
          captureInProgress: true,
          rendererHandleConsumerCount: 1,
        },
        features: {
          performerPropsSupported: false,
          locomotionActive: true,
          effectSourceCount: 1,
        },
      })
    );

    expect(decision).toEqual({
      backend: "legacy",
      environment: null,
      fallbackReasons: [
        "offscreen-canvas-unavailable",
        "prop-family-not-migrated",
        "effects-not-migrated",
        "scene-markers-not-migrated",
        "audience-not-migrated",
        "world-children-not-migrated",
        "retained-environments-not-migrated",
        "camera-mode-not-migrated",
        "capture-not-migrated",
        "renderer-handle-required",
      ],
    });
  });
});
