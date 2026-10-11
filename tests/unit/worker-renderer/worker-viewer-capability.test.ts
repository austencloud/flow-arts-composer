import { describe, expect, it } from "vitest";

import {
  decideWorkerViewerCapability,
  type WorkerViewerCapabilitySnapshot,
} from "#lib/shared/3d/worker-renderer/domain/worker-viewer-capability.js";

const migratedEnvironments = new Set(["ocean", "rainbow", "void"] as const);

function supported(
  overrides: Partial<WorkerViewerCapabilitySnapshot> = {}
): WorkerViewerCapabilitySnapshot {
  return {
    offscreenCanvasAvailable: true,
    environment: "ocean",
    migratedEnvironments,
    performerPropsSupported: true,
    locomotionActive: false,
    effectsActive: false,
    sceneMarkersVisible: false,
    audienceVisible: false,
    hasWorldChildren: false,
    retainsEnvironments: false,
    cameraMode: "orbit",
    captureActive: false,
    requiresRendererHandle: false,
    ...overrides,
  };
}

describe("decideWorkerViewerCapability", () => {
  it("selects the worker only when the complete requested frame is supported", () => {
    expect(decideWorkerViewerCapability(supported())).toEqual({
      backend: "worker",
      fallbackReasons: [],
    });
  });

  it("falls back when the browser or environment cannot run in the worker", () => {
    expect(
      decideWorkerViewerCapability(
        supported({
          offscreenCanvasAvailable: false,
          environment: "forest",
        })
      )
    ).toEqual({
      backend: "legacy",
      fallbackReasons: [
        "offscreen-canvas-unavailable",
        "environment-not-migrated",
      ],
    });
  });

  it("names every visible production feature that would otherwise disappear", () => {
    expect(
      decideWorkerViewerCapability(
        supported({
          performerPropsSupported: false,
          locomotionActive: true,
          effectsActive: true,
          sceneMarkersVisible: true,
          audienceVisible: true,
          hasWorldChildren: true,
          retainsEnvironments: true,
          cameraMode: "choreography",
          captureActive: true,
          requiresRendererHandle: true,
        })
      ).fallbackReasons
    ).toEqual([
      "prop-family-not-migrated",
      "effects-not-migrated",
      "scene-markers-not-migrated",
      "audience-not-migrated",
      "world-children-not-migrated",
      "retained-environments-not-migrated",
      "camera-mode-not-migrated",
      "capture-not-migrated",
      "renderer-handle-required",
    ]);
  });

  it.each(["fly", "walk", "choreography", "reframe"] as const)(
    "keeps the %s camera on the legacy renderer until parity exists",
    (cameraMode) => {
      expect(
        decideWorkerViewerCapability(supported({ cameraMode }))
      ).toMatchObject({
        backend: "legacy",
        fallbackReasons: ["camera-mode-not-migrated"],
      });
    }
  );
});
