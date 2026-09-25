import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { PlaneMode } from "@austencloud/scene-3d";
import type { CharacterInstanceState } from "$lib/shared/3d/state/character-instance-state.svelte";
import { resolvePerformerUpperBodyStance } from "$lib/shared/3d/domain/performer-upper-body-stance";
import {
  getAnimationVisibilityManager,
  type AnimationPathPolicy,
} from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
import type { EffortId } from "$lib/shared/effort/domain/effort-types";
import type { EffortTimeline } from "$lib/shared/effort/domain/effort-timeline-types";

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
});
