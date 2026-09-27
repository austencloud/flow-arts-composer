import type { PlaneMode } from "@austencloud/scene-3d";
import {
  getAnimationVisibilityManager,
  type AnimationPathPolicy,
} from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
import type { CharacterInstanceState } from "../state/character-instance-state.svelte";

/**
 * Everything besides the clock that decides where the score puts the props
 * (`propStatesAtScoreTime`). A plan sampled from those props, like the torso
 * turn or the hard-beat displacement, goes stale when any of these changes:
 * the effort reshapes the timing inside each beat, and the path policy moves
 * the props between grid points for motions that do not set their own path.
 */
export interface ScoreMotionKey {
  /** A new array on every conversion, a new sequence included. */
  stepConfigs: CharacterInstanceState["stepConfigs"];
  planeMode: PlaneMode;
  stepCount: number;
  loop: boolean;
  effortId: CharacterInstanceState["effectiveEffortId"];
  effortTimeline: CharacterInstanceState["effortTimeline"];
  pathShape: AnimationPathPolicy["pathShape"];
  motionAwarePaths: boolean;
}

export function scoreMotionKey(
  performer: CharacterInstanceState
): ScoreMotionKey {
  const paths = getAnimationVisibilityManager().getPathPolicy();
  return {
    stepConfigs: performer.stepConfigs,
    planeMode: performer.planeMode,
    stepCount: performer.motionStepCount,
    loop: performer.loop,
    effortId: performer.effectiveEffortId,
    effortTimeline: performer.effortTimeline,
    pathShape: paths.pathShape,
    motionAwarePaths: paths.motionAwarePaths,
  };
}

/** Field by field, so a key extended with more inputs compares those too. */
export function sameScoreMotionKey<K extends ScoreMotionKey>(
  a: K,
  b: K
): boolean {
  return (Object.keys(a) as (keyof K)[]).every(
    (field) => a[field] === b[field]
  );
}
