/**
 * Motion cues: teaching marks a player can lay over one prop's motion.
 *
 * - ghosts: faint copies of the prop left behind at fixed points of the play
 *   (a quarter of the way through, half way, ...). Each appears when the play
 *   passes its time and stays after the play ends.
 * - hand path: the path the hand (the prop's centre) has travelled so far,
 *   with a dot at the hand.
 * - thumb ring: a ring on the prop's thumb end that moves with it.
 *
 * Everything here is opt-in. A player that passes no cues draws nothing new.
 * The poses are sampled once per load, so a frame draws cached sprites and a
 * polyline; nothing rebuilds prop geometry per frame.
 */

import type { PropState } from "#lib/shared/foundation/domain/types/prop-state.js";
import { TUNNEL_LAYER_COLORS } from "../compose-types";

/** The fixed sample times of the ghost copies; the live prop is t = 1. */
export const MOTION_CUE_GHOST_TIMES: readonly number[] = [0, 0.25, 0.5, 0.75];

/** How many hand positions the path is sampled at across one play. */
export const MOTION_CUE_PATH_SAMPLES = 48;

/** Opacity of each ghost copy, oldest faintest (the review mock's ramp,
 * nudged up because a full sprite reads lighter than the mock's line). */
export const MOTION_CUE_GHOST_ALPHAS: readonly number[] = [
  0.16, 0.22, 0.28, 0.34,
];

/** Cue colours come from the existing cyan/yellow prop-colour pair, so the
 * hand never reads as the staff's red or blue. */
const CUE_PALETTE = TUNNEL_LAYER_COLORS[3] ?? {
  left: "#06b6d4",
  right: "#eab308",
};
export const MOTION_CUE_HAND_COLOR = CUE_PALETTE.left;
export const MOTION_CUE_THUMB_COLOR = CUE_PALETTE.right;

/** What a player asks for. */
export interface MotionCueOptions {
  ghosts?: boolean;
  handPath?: boolean;
  thumbRing?: boolean;
}

/** One hand's precomputed poses. */
export interface MotionCueSide {
  /** Pose at each of MOTION_CUE_GHOST_TIMES. */
  ghosts: PropState[];
  /** Pose at evenly spaced times 0..1 (MOTION_CUE_PATH_SAMPLES + 1 points). */
  path: PropState[];
}

/** Everything the renderer needs for a frame, rebuilt only when a load or a
 * flag changes. */
export interface MotionCueFrame {
  ghosts: boolean;
  handPath: boolean;
  thumbRing: boolean;
  /** Steps of motion in the sequence; progress runs over 1..1 + stepCount. */
  stepCount: number;
  /** False until the first play starts. A card that has never played (or
   * that rests under reduced motion) shows the whole picture. */
  everPlayed: boolean;
  left: MotionCueSide | null;
  right: MotionCueSide | null;
}

const clamp01 = (value: number): number =>
  value < 0 ? 0 : value > 1 ? 1 : value;

/** How far through the play a frame is, 0..1. Step 0..1 is the start hold;
 * the motion runs from step 1 to step 1 + stepCount. */
export function motionCueProgress(
  currentStep: number,
  stepCount: number,
  everPlayed: boolean
): number {
  if (!everPlayed || stepCount <= 0) return 1;
  return clamp01((currentStep - 1) / stepCount);
}

/** Indexes of the ghosts showing at progress p. A ghost lands once the play
 * has passed its time; at the end every ghost shows. */
export function visibleGhostIndexes(
  times: readonly number[],
  progress: number
): number[] {
  const shown: number[] = [];
  for (let i = 0; i < times.length; i++) {
    if (progress >= 1 || times[i]! < progress) shown.push(i);
  }
  return shown;
}

/** The step to sample for a time t in 0..1. The very end is pulled just inside
 * the last step: the sampler's exact end can fall through to its fallback. */
export function motionCueStepAt(t: number, stepCount: number): number {
  return 1 + Math.min(clamp01(t) * stepCount, stepCount - 0.0001);
}

/** Sample one load's cue poses with a pure pose sampler. */
export function sampleMotionCueSides(
  sample: (step: number) => { left: PropState; right: PropState },
  stepCount: number,
  sides: { left: boolean; right: boolean }
): { left: MotionCueSide | null; right: MotionCueSide | null } {
  const left: MotionCueSide | null = sides.left ? { ghosts: [], path: [] } : null;
  const right: MotionCueSide | null = sides.right
    ? { ghosts: [], path: [] }
    : null;
  if (stepCount <= 0) return { left, right };
  for (const t of MOTION_CUE_GHOST_TIMES) {
    const pose = sample(motionCueStepAt(t, stepCount));
    left?.ghosts.push({ ...pose.left });
    right?.ghosts.push({ ...pose.right });
  }
  for (let i = 0; i <= MOTION_CUE_PATH_SAMPLES; i++) {
    const pose = sample(motionCueStepAt(i / MOTION_CUE_PATH_SAMPLES, stepCount));
    left?.path.push({ ...pose.left });
    right?.path.push({ ...pose.right });
  }
  return { left, right };
}

/**
 * The mandala guide's visibility on a motion-cue canvas. The guide draws the
 * whole path of both staff ends (the visitor's "mandala" setting), which on a
 * cue card reads as a second hand path, so a card that draws its own hand
 * path turns it off. Undefined leaves every other canvas on the visitor's
 * setting.
 */
export function motionCueMandalaOverride(
  cues: { handPath: boolean } | null | undefined
): false | undefined {
  return cues?.handPath ? false : undefined;
}

/** A motion-cue card lays its minimal progress line on the canvas's bottom
    edge, not in a band under it (the card's square has no height to spare). */
export function motionCueProgressOnCanvas(
  cues: { handPath: boolean } | null | undefined
): boolean {
  return !!cues?.handPath;
}
