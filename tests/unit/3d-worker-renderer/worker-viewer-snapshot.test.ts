import { describe, expect, it, vi } from "vitest";
import { SceneEnvironmentId } from "#lib/shared/3d/environments/domain/scene-environment.js";
import type { SceneEffectTipSource3D } from "#lib/shared/3d/effects/scene-effects/scene-effect-source-3d.js";
import type { CharacterInstanceState } from "#lib/shared/3d/state/character-instance-state.svelte.js";
import type { WorkerPerformerSnapshot } from "#lib/shared/3d/worker-renderer/domain/worker-renderer-protocol.js";
import {
  createWorkerViewerSnapshot,
  type WorkerViewerSnapshotInput,
} from "#lib/shared/3d/worker-renderer/services/worker-viewer-snapshot.js";

const mocks = vi.hoisted(() => ({
  createWorkerPerformerSnapshot: vi.fn(),
}));

vi.mock(
  "#lib/shared/3d/worker-renderer/services/worker-performer-snapshot.js",
  () => ({
    supportsWorkerPerformer: (options: {
      leftPropType: string;
      rightPropType: string;
    }) => options.leftPropType === "staff" && options.rightPropType === "staff",
    createWorkerPerformerSnapshot: mocks.createWorkerPerformerSnapshot,
  })
);

mocks.createWorkerPerformerSnapshot.mockImplementation(
  (performer: CharacterInstanceState): WorkerPerformerSnapshot => ({
    id: performer.id,
    avatarId: "x-bot",
    position: [1, 2, 3],
    facingAngle: 0,
    avatarHeightCm: 175,
    groundY: 0,
    staffLength: 1.5,
    staffThickness: 0.02,
    propBuild: {
      finish: "fire",
      fanBuild: "pictograph",
      fanFrameColor: "black",
      fanCover: "bare",
    },
    leftPropType: "staff",
    rightPropType: "staff",
    leftProp: null,
    rightProp: null,
    stanceYaw: 0,
    stanceSegments: null,
    spinePitchOffset: 0,
  })
);

function input(): WorkerViewerSnapshotInput & {
  performers: Array<WorkerViewerSnapshotInput["performers"][number]>;
  effects: { playing: boolean; sources: SceneEffectTipSource3D[] };
} {
  return {
    environmentId: SceneEnvironmentId.OCEAN,
    camera: {
      position: [0, 2, 6] as const,
      target: [0, 1, 0] as const,
      fov: 45,
      quaternion: [0, 0, 0, 1] as const,
      up: [0, 1, 0] as const,
    },
    performers: [
      {
        performer: { id: "performer-a" } as CharacterInstanceState,
        options: {
          leftPropType: "staff",
          rightPropType: "staff",
          propBuild: {
            finish: "fire",
            fanBuild: "pictograph",
            fanFrameColor: "black",
            fanCover: "bare",
          },
        },
      },
    ],
    effects: { playing: false, sources: [] },
    conditions: {
      offscreenCanvasAvailable: true,
      visibleSceneMarkerCount: 0,
      visibleAudienceMemberCount: 0,
      worldChildCount: 0,
      retainedEnvironmentCount: 0,
      cameraMode: "orbit" as const,
      captureInProgress: false,
      rendererHandleConsumerCount: 0,
    },
  };
}

describe("worker viewer snapshot", () => {
  it("copies a complete worker frame from already-resolved inputs", () => {
    const source = input();
    const decision = createWorkerViewerSnapshot(source);

    expect(decision).toMatchObject({
      backend: "worker",
      snapshot: {
        environment: "ocean",
        camera: source.camera,
        performers: [{ id: "performer-a" }],
        effects: { playing: false, sources: [] },
      },
      fallbackReasons: [],
    });
    expect(mocks.createWorkerPerformerSnapshot).toHaveBeenCalledWith(
      source.performers[0].performer,
      source.performers[0].options
    );
    expect(() => structuredClone(decision)).not.toThrow();
    if (decision.backend === "worker") {
      expect(decision.snapshot.camera).not.toBe(source.camera);
      expect(decision.snapshot.effects).not.toBe(source.effects);
    }
  });

  it("does not serialize performers after an unknown prop fails the gate", () => {
    mocks.createWorkerPerformerSnapshot.mockClear();
    const source = input();
    source.performers[0].options.leftPropType = "not-a-prop";

    expect(createWorkerViewerSnapshot(source)).toEqual({
      backend: "legacy",
      snapshot: null,
      fallbackReasons: ["prop-family-not-migrated"],
    });
    expect(mocks.createWorkerPerformerSnapshot).not.toHaveBeenCalled();
  });

  it("accepts exact worker locomotion while still rejecting unsupported effects", () => {
    const source = input();
    source.performers[0].options.enableLocomotion = true;
    source.effects.sources = [
      {
        effect: "sparkles",
        sourceId: 1,
        propIndex: 0,
        tipIndex: 0,
        position: { x: 0, y: 1, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        speed: 0,
        currentStep: 0,
        propColor: "#ffffff",
        params: {
          rate: 1,
          size: 1,
          lifetime: 1,
          color: "#ffffff",
          palette: ["#ffffff"],
          colorMode: "solid",
          spread: 0,
          gravity: 0,
          mode: "stream",
          poolSize: 8,
          baseRadius: 0.01,
          worldGravity: 0,
          worldSpread: 0,
        },
      },
    ];

    expect(createWorkerViewerSnapshot(source)).toEqual({
      backend: "legacy",
      snapshot: null,
      fallbackReasons: ["effects-not-migrated"],
    });
  });

  it("does not treat enabled-but-empty marker and effect systems as visible", () => {
    const source = input();
    source.effects.playing = true;

    expect(createWorkerViewerSnapshot(source).backend).toBe("worker");
  });
});
