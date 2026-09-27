import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GRID_OFFSETS,
  Plane,
  PlaneMode,
  PLANE_MODE_CONFIGS,
  PropType,
  userProportionsState,
} from "@austencloud/scene-3d";
import { Quaternion, Vector3 } from "three";
import type { CharacterInstanceState } from "$lib/shared/3d/state/character-instance-state.svelte";
import {
  createWorkerPerformerSnapshot,
  supportsWorkerPerformer,
  supportsWorkerPerformerEffectIntent,
} from "$lib/shared/3d/worker-renderer/services/worker-performer-snapshot";
import { CANONICAL_PERFORMER_ANCHOR_Y } from "$lib/shared/3d/environments/domain/stage-coordinate-frame";
import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";
import {
  resolveLed3D,
  resolveTrails3D,
} from "$lib/shared/effects/translators/webgl3d-translator";

vi.mock("$lib/shared/3d/domain/performer-upper-body-stance", () => ({
  resolvePerformerUpperBodyStance: () => ({
    yawRad: 0.25,
    pitchRad: -0.1,
    segments: { spine1Rad: 0.1, spine2Rad: 0.2, headLagRad: 0.3 },
    leftDepthOffsetM: 0.07,
    rightDepthOffsetM: -0.04,
  }),
}));

const PROP_BUILD = {
  finish: "fire",
  fanBuild: "pictograph",
  fanFrameColor: "black",
  fanCover: "bare",
} as const;

function performer(): CharacterInstanceState {
  const prop = {
    centerPathAngle: 1,
    staffRotationAngle: 2,
    plane: Plane.WALL,
    worldPosition: new Vector3(3, 4, 5),
    worldRotation: new Quaternion(0, 0, 0, 1),
    gripType: "square",
  };
  return {
    id: "p1",
    characterId: "x-bot",
    position: { x: 6, y: 99, z: 7 },
    facingAngle: 0.4,
    planeMode: PlaneMode.WALL,
    settings: { staffLengthCm: null },
    showLeft: true,
    showRight: false,
    leftPropState: prop,
    rightPropState: prop,
    isMoving: true,
    moveSpeed: 1.25,
    moveDirection: { x: 0.25, z: 0.75 },
    gaitTimingSample: {
      planId: "gait-a",
      gaitStep: 2.5,
      cadence: 1.8,
      arrived: false,
      settled: false,
      settleProgress: 0,
    },
    terminalStepPlan: null,
  } as unknown as CharacterInstanceState;
}

describe("worker performer snapshots", () => {
  beforeEach(() => {
    userProportionsState.reset();
  });

  it("allows only prop geometry the worker owns exactly", () => {
    expect(
      supportsWorkerPerformer({
        leftPropType: "staff",
        rightPropType: "staff",
        propBuild: PROP_BUILD,
      })
    ).toBe(true);
    expect(
      supportsWorkerPerformer({
        leftPropType: "fan",
        rightPropType: "staff",
        propBuild: PROP_BUILD,
      })
    ).toBe(true);
    expect(
      supportsWorkerPerformer({
        leftPropType: "hand",
        rightPropType: "hand",
        propBuild: PROP_BUILD,
      })
    ).toBe(true);
  });

  it("refuses to serialize an unknown prop", () => {
    expect(() =>
      createWorkerPerformerSnapshot(performer(), {
        leftPropType: "not-a-prop",
        rightPropType: PropType.STAFF,
        propBuild: PROP_BUILD,
      })
    ).toThrow("cannot reproduce not-a-prop/staff exactly");
  });

  it("serializes resolved Choreo transforms without moving their ownership", () => {
    const snapshot = createWorkerPerformerSnapshot(performer(), {
      leftPropType: "staff",
      rightPropType: "staff",
      propBuild: PROP_BUILD,
      badge: {
        index: 2,
        selected: false,
        allMode: true,
        visible: true,
      },
    });

    expect(snapshot.position).toEqual([6, CANONICAL_PERFORMER_ANCHOR_Y, 7]);
    expect(snapshot.groundY).toBe(userProportionsState.groundY);
    expect(snapshot.staffLength).toBe(userProportionsState.staffLength);
    expect(snapshot.staffThickness).toBe(
      userProportionsState.dimensions.staffRadius
    );
    expect(snapshot.leftProp?.worldPosition).toEqual([3, 4, 5]);
    expect(snapshot.leftProp?.handAnchor).toEqual([
      PLANE_MODE_CONFIGS[PlaneMode.WALL].blueLateralOffset,
      0,
      GRID_OFFSETS[PlaneMode.WALL] + 0.07,
    ]);
    expect(snapshot.leftProp?.flipped).toBe(false);
    expect(snapshot.rightProp).toBeNull();
    expect(snapshot.stanceYaw).toBe(0.25);
    expect(snapshot.spinePitchOffset).toBe(-0.1);
    expect(snapshot.badge).toEqual({
      index: 2,
      color: expect.any(String),
      opacity: 0.6,
      selected: false,
    });
  });

  it("serializes Buugeng chirality at the same correction boundary as PerformerRig", () => {
    const snapshot = createWorkerPerformerSnapshot(performer(), {
      leftPropType: "buugeng",
      rightPropType: "buugeng",
      propBuild: PROP_BUILD,
      leftPropFlipped: true,
      rightPropFlipped: false,
    });

    expect(snapshot.leftProp?.flipped).toBe(true);
    expect(snapshot.rightProp).toBeNull();
  });

  it("omits the badge when scene markers are hidden", () => {
    const snapshot = createWorkerPerformerSnapshot(performer(), {
      leftPropType: "staff",
      rightPropType: "staff",
      propBuild: PROP_BUILD,
      badge: { index: 0, selected: true, allMode: false, visible: false },
    });

    expect(snapshot.badge).toBeNull();
  });

  it("serializes clone-safe locomotion and the canonical turn request", () => {
    const snapshot = createWorkerPerformerSnapshot(performer(), {
      leftPropType: "staff",
      rightPropType: "staff",
      propBuild: PROP_BUILD,
      enableLocomotion: true,
    });

    expect(snapshot.locomotion).toEqual({
      isMoving: true,
      moveSpeed: 1.25,
      moveDirection: { x: 0.25, z: 0.75 },
      lateralGait: "sidestep",
      gaitTimingSample: expect.objectContaining({ planId: "gait-a" }),
      terminalStepPlan: null,
      turnRequest: null,
    });
    expect(() => structuredClone(snapshot)).not.toThrow();
  });

  it("serializes app-owned effect choices and final selection state without coordinates", () => {
    const effectIntent = {
      playing: true,
      sampledAtMs: 1234,
      currentStep: 2.5,
      totalSteps: 16,
      seamlesslyLoopable: true,
      qualityTier: "high" as const,
      propBuild: PROP_BUILD,
      tips: [
        {
          propIndex: 0 as const,
          tipIndex: 1 as const,
          effect: "trails" as const,
        },
      ],
      trails: resolveTrails3D(DEFAULT_EFFECTS_CONFIG.trails),
      led: resolveLed3D(DEFAULT_EFFECTS_CONFIG.led),
      pooled: {},
    };
    const snapshot = createWorkerPerformerSnapshot(performer(), {
      leftPropType: "staff",
      rightPropType: "staff",
      propBuild: PROP_BUILD,
      effectIntent,
      selectionMarker: {
        color: 0x3b82f6,
        selected: true,
        allPerformersSelected: false,
        present: true,
        pulsePhase: 1.25,
        hovered: true,
        dragging: false,
      },
    });

    expect(snapshot.effectIntent).toEqual(effectIntent);
    expect(snapshot.effectIntent).not.toBe(effectIntent);
    expect(snapshot.selectionMarker?.groundPosition).toEqual([
      6,
      userProportionsState.groundY + CANONICAL_PERFORMER_ANCHOR_Y,
      7,
    ]);
    expect(() => structuredClone(snapshot)).not.toThrow();
  });

  it("fails closed before serializing an unsupported effect", () => {
    const invalid = {
      playing: true,
      sampledAtMs: 0,
      currentStep: 0,
      totalSteps: 1,
      seamlesslyLoopable: false,
      qualityTier: "high" as const,
      propBuild: PROP_BUILD,
      tips: [{ propIndex: 0, tipIndex: 0, effect: "zap" }],
      trails: resolveTrails3D(DEFAULT_EFFECTS_CONFIG.trails),
      led: resolveLed3D(DEFAULT_EFFECTS_CONFIG.led),
      pooled: {},
    };

    expect(() =>
      createWorkerPerformerSnapshot(performer(), {
        leftPropType: "staff",
        rightPropType: "staff",
        propBuild: PROP_BUILD,
        effectIntent: invalid as never,
      })
    ).toThrow("cannot reproduce zap exactly");
    expect(supportsWorkerPerformerEffectIntent(invalid as never)).toBe(false);
  });
});
