import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { PlaneMode, userProportionsState } from "@austencloud/scene-3d";
import {
  createCharacterInstanceState,
  makeStandaloneDeps,
  type CharacterInstanceState,
} from "$lib/shared/3d/state/character-instance-state.svelte";
import { resolvePerformerUpperBodyStance } from "$lib/shared/3d/domain/performer-upper-body-stance";
import {
  getAnimationVisibilityManager,
  type AnimationPathPolicy,
} from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
import type { EffortId } from "$lib/shared/effort/domain/effort-types";
import type { EffortTimeline } from "$lib/shared/effort/domain/effort-timeline-types";
import { propContinuityCorpus } from "../../tools/prop-continuity-corpus";

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
    settings: { staffLengthCm: null as number | null },
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
let savedStaffLengthCm: number;

beforeEach(() => {
  savedPaths = paths.getPathPolicy();
  savedStaffLengthCm = userProportionsState.staffLengthCm;
});

afterEach(() => {
  paths.setPathPolicy(savedPaths);
  userProportionsState.setStaffLengthCm(savedStaffLengthCm);
});

/** A performer playing one of the prop-continuity sequences on the wall. */
function performerFor(id: string): CharacterInstanceState {
  const entry = propContinuityCorpus().find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`no corpus entry ${id}`);
  const state = createCharacterInstanceState(
    { id: `stance-${id}`, persistent: false },
    makeStandaloneDeps()
  );
  state.setPlaneMode(PlaneMode.WALL);
  state.loadSequence(entry.sequence);
  return state;
}

function seek(performer: CharacterInstanceState, scoreTime: number) {
  const beat = Math.floor(scoreTime);
  performer.goToStep(beat + performer.motionStepOffset);
  performer.setProgress(scoreTime - beat);
}

describe("performer upper-body stance", () => {
  it("reuses the planned track while nothing that moves the props changes", () => {
    const { performer, replanned } = standInPerformer();
    expect(replanned()).toBe(true);
    expect(replanned()).toBe(false);
    // The playhead advancing is playback through the same score.
    performer.scoreTime = 2.75;
    expect(replanned()).toBe(false);
  });

  // Each of these changes where the score puts the props or how long the
  // drawn staff is. A torso planned before it would turn on the old timing,
  // or open side-on lanes sized for the old staff.
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
    [
      "the performer's staff length",
      (performer) => {
        performer.settings.staffLengthCm = 120;
      },
    ],
    [
      "the user's staff length, drawn for a performer without its own",
      () => {
        userProportionsState.setStaffLengthCm(
          userProportionsState.staffLengthCm + 20
        );
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

  it("sizes the side-on lanes for the staff the performer is drawn holding", () => {
    // Early in beat 2 of tog-same the chest is fully side-on and the right
    // hand's staff reaches into it; a longer staff reaches further, so that
    // hand's lane opens wider and its grip moves.
    const performer = performerFor("tnd-tog-same-gggg");
    const gripDepths = () => {
      seek(performer, 1);
      const stance = resolvePerformerUpperBodyStance(performer);
      expect(stance.sideBlend).toBe(1);
      return [stance.leftDepthOffsetM, stance.rightDepthOffsetM];
    };
    const drawnDefault = gripDepths();
    performer.setStaffLengthCm(120);
    const [left, right] = gripDepths();
    expect(left).toBe(drawnDefault[0]);
    expect(Math.abs(right! - drawnDefault[1]!)).toBeGreaterThan(0.02);
    performer.setStaffLengthCm(null);
    expect(gripDepths()).toEqual(drawnDefault);
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
      settings: { staffLengthCm: null },
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
