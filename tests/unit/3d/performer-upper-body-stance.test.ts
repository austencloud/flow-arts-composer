import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { PlaneMode } from "@austencloud/scene-3d";
import type { CharacterInstanceState } from "#lib/shared/3d/state/character-instance-state.svelte.js";
import { resolvePerformerUpperBodyStance } from "#lib/shared/3d/domain/performer-upper-body-stance.js";
import {
  getAnimationVisibilityManager,
  type AnimationPathPolicy,
} from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
import type { EffortId } from "#lib/shared/effort/domain/effort-types.js";
import type { EffortTimeline } from "#lib/shared/effort/domain/effort-timeline-types.js";

/**
 * A stand-in performer holding a still pair. Planning a torso track samples the
 * whole score through `propStatesAtScoreTime`; posing a frame from a track that
 * is already planned does not. Counting those reads tells a replan from a reuse.
 */
function standInPerformer() {
  const left = { worldPosition: new Vector3(0.25, 1.3, 0) };
  const right = { worldPosition: new Vector3(-0.25, 1.3, 0) };
  let scoreReads = 0;
  const performer = {
    stepConfigs: [] as CharacterInstanceState["stepConfigs"],
    planeMode: PlaneMode.WALL as PlaneMode,
    motionStepCount: 4,
    loop: true,
    effectiveEffortId: "linear" as EffortId,
    effortTimeline: null as EffortTimeline | null,
    scoreTime: 1.5,
    leftPropState: left,
    rightPropState: right,
    propStatesAtScoreTime: () => {
      scoreReads += 1;
      return { left, right };
    },
  };
  /** Pose this frame's torso; true when that planned a new track. */
  const replanned = () => {
    const before = scoreReads;
    resolvePerformerUpperBodyStance(
      performer as unknown as CharacterInstanceState
    );
    return scoreReads > before;
  };
  return { performer, replanned };
}

type StandIn = ReturnType<typeof standInPerformer>["performer"];

const paths = getAnimationVisibilityManager();
let savedPaths: AnimationPathPolicy;

beforeEach(() => {
  savedPaths = paths.getPathPolicy();
});

afterEach(() => {
  paths.setPathPolicy(savedPaths);
});

describe("performer upper-body stance", () => {
  it("reuses the planned track while nothing that moves the props changes", () => {
    const { performer, replanned } = standInPerformer();
    expect(replanned()).toBe(true);
    expect(replanned()).toBe(false);
    // The playhead advancing is playback through the same score.
    performer.scoreTime = 2.75;
    expect(replanned()).toBe(false);
  });

  // Each of these changes where the score puts the props, so a torso planned
  // before it would turn on the old timing while the hands follow the new one.
  const changes: [string, (performer: StandIn) => void][] = [
    [
      "the effort",
      (performer) => {
        performer.effectiveEffortId = "punch";
      },
    ],
    [
      "the effort timeline",
      (performer) => {
        performer.effortTimeline = {
          phrases: [{ id: "p", effortId: "glide", startStep: 1, endStep: 2 }],
          transition: "hard",
        };
      },
    ],
    [
      "the converted steps",
      (performer) => {
        // A rotation variant or per-beat plane re-converts the same sequence.
        performer.stepConfigs = [...performer.stepConfigs];
      },
    ],
    [
      "the path shape",
      () => {
        paths.setPathShape(
          paths.getPathShape() === "linear" ? "arc" : "linear"
        );
      },
    ],
    [
      "motion-aware paths",
      () => {
        paths.setMotionAwarePaths(!paths.getMotionAwarePaths());
      },
    ],
  ];

  it.each(changes)("replans the torso after %s changes", (_, change) => {
    const { performer, replanned } = standInPerformer();
    expect(replanned()).toBe(true);
    change(performer);
    expect(replanned()).toBe(true);
    expect(replanned()).toBe(false);
  });

  it("holds the torso where beat 1 starts while the start pose plays", () => {
    const at = (x: number) => ({ worldPosition: new Vector3(x, 1.3, 0) });
    // Square as beat 1 starts, both props on the performer's left from
    // halfway through it, so the planned turn is under way by 0.6.
    const square = { left: at(0.25), right: at(-0.25) };
    const turned = { left: at(0.45), right: at(0.45) };
    const performer = {
      stepConfigs: [] as CharacterInstanceState["stepConfigs"],
      planeMode: PlaneMode.WALL as PlaneMode,
      motionStepCount: 4,
      loop: true,
      effectiveEffortId: "linear" as EffortId,
      effortTimeline: null as EffortTimeline | null,
      // The start pose is step 0 and beat 1 is step 1. The raw clock runs
      // across the start pose while the props hold beat 1's start.
      motionStepOffset: 1,
      currentStepIndex: 0,
      scoreTime: 0.6,
      leftPropState: square.left,
      rightPropState: square.right,
      propStatesAtScoreTime: (scoreTime: number) =>
        scoreTime >= 0.5 && scoreTime < 2 ? turned : square,
    };
    const yaw = () =>
      resolvePerformerUpperBodyStance(
        performer as unknown as CharacterInstanceState
      ).yawRad;

    const startPose = yaw();
    performer.currentStepIndex = 1;
    performer.scoreTime = 0;
    const beatOneStart = yaw();
    performer.scoreTime = 0.6;
    const intoBeatOne = yaw();

    expect(startPose).toBe(beatOneStart);
    // The turn the raw clock would have shown during the start pose.
    expect(Math.abs(intoBeatOne)).toBeGreaterThan(Math.abs(beatOneStart) + 0.1);
  });
});
