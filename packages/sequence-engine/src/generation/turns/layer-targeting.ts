/**
 * Aiming a generated sequence at a layer signature.
 *
 * A sequence's layer signature — which of the four radial/non-radial
 * combinations the two props sit in, step by step — is decided entirely by its
 * turns. Nothing about the letters, the placements, or the hand paths moves it.
 * That is what makes it targetable: to put a step in a chosen layer you only
 * have to make each prop either cross or not cross, and every motion can be
 * made to do either by nudging its turn value.
 *
 * The nudge is small and always the same shape. A prop crosses when its turn
 * value is a half — 0.5, 1.5, 2.5 — and stays put when the value is whole. So
 * asking a motion to cross means adding a half turn to it, and asking it not to
 * means dropping the half back off. A float always crosses (a float only ever
 * happens on a shift, and a shift always carries the hand around the circle),
 * so a float that has been asked to stay put becomes an ordinary spin again.
 *
 * Two things follow, and both show up in real sequences:
 *
 *   Non-radial is a level 3 idea. Level 1 has no turns and level 2 has only
 *   whole ones, so no prop below level 3 can leave radial at all: those
 *   sequences are not just frozen, they are frozen in layer 1. Half turns
 *   arrive at level 3, and from there every signature is reachable.
 *
 *   A sequence that repeats needs each prop to cross an even number of times,
 *   or the second time through starts in a different layer than the first and
 *   the whole thing looks different on the repeat.
 *
 * Retargeting changes turn values, which changes the orientations that follow
 * from them. Run this BEFORE orientation propagation, or propagate again after.
 */

import type { SequenceStep, Motion } from "../../core/types/sequence-engine-types.js";
import {
  flipsLayer,
  type FlipVector,
  type LayerPattern,
} from "../../core/orientation/layer-signature.js";
import { getTurnPool } from "./TurnAllocator.js";

export interface LayerTargetOptions {
  /**
   * The level being generated. Levels decide which turn values exist at all —
   * level 1 has only zero, level 2 only whole numbers — so retargeting asks the
   * turn allocator for the level's pool rather than inventing a value. Without
   * it, a request to cross would quietly write a half turn into a level 2
   * sequence, which is not a level 2 sequence any more.
   */
  level?: number;
  /** Largest turn value allowed, matching the request's turn intensity. */
  maxTurnIntensity?: number;
}

/** A motion the retarget could not satisfy, and why. */
export interface LayerTargetMiss {
  /** Index into the step array, where 0 is the start placement. */
  readonly stepIndex: number;
  readonly hand: "left" | "right";
  readonly reason: string;
}

export interface LayerTargetResult {
  readonly steps: SequenceStep[];
  /** True when every motion ended up crossing exactly as the pattern asked. */
  readonly satisfied: boolean;
  readonly misses: LayerTargetMiss[];
}

const DEFAULT_LEVEL = 3;

/** Turn values the level allows, split by whether they make the prop cross. */
function turnChoices(options: LayerTargetOptions): {
  crossing: number[];
  holding: number[];
} {
  const pool = getTurnPool(options.level ?? DEFAULT_LEVEL, options.maxTurnIntensity, {
    allowFloat: false,
  }).filter((t): t is number => typeof t === "number");

  return {
    // A prop crosses on a half turn and stays where it is on a whole one.
    crossing: pool.filter((t) => !Number.isInteger(t)).sort((a, b) => a - b),
    holding: pool.filter((t) => Number.isInteger(t)).sort((a, b) => a - b),
  };
}

/** The allowed value closest to what the motion already carries. */
function nearest(values: number[], to: number): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((best, value) =>
    Math.abs(value - to) < Math.abs(best - to) ? value : best
  );
}

/**
 * Rewrite one motion so its prop crosses, or does not cross, as asked.
 * Returns the motion unchanged when it already behaves, or when the turn
 * values available cannot express the request.
 */
export function retargetMotionFlip(
  motion: Motion,
  wantFlip: boolean,
  options: LayerTargetOptions = {}
): { motion: Motion; satisfied: boolean; reason?: string } {
  const level = options.level ?? DEFAULT_LEVEL;
  const { crossing, holding } = turnChoices(options);

  if (flipsLayer(motion) === wantFlip) {
    return { motion, satisfied: true };
  }

  const isFloat = motion.motionType === "float" || motion.turns === "fl";

  if (!wantFlip) {
    // Asking a prop to stay put. A float has to stop being a float — put back
    // the spin it was standing in for and give it no turns.
    if (isFloat) {
      const { prefloatMotionType, prefloatRotationDirection, ...rest } = motion;
      return {
        motion: {
          ...rest,
          motionType: prefloatMotionType ?? motion.motionType,
          rotationDirection: prefloatRotationDirection ?? motion.rotationDirection,
          turns: 0,
        },
        satisfied: true,
      };
    }
    // Otherwise trade the half turn for the nearest whole one the level allows.
    const turns = typeof motion.turns === "number" ? motion.turns : 0;
    const whole = nearest(holding, turns);
    if (whole === undefined) {
      return {
        motion,
        satisfied: false,
        reason: `level ${level} offers no turn value that keeps a prop in its layer`,
      };
    }
    return { motion: { ...motion, turns: whole }, satisfied: true };
  }

  // Asking a prop to cross. A float already crosses unless its hand never went
  // around the circle, and turns cannot rescue that — the float ignores them.
  if (isFloat) {
    return {
      motion,
      satisfied: false,
      reason: "float on a hand path that does not travel around the circle",
    };
  }

  const turns = typeof motion.turns === "number" ? motion.turns : 0;
  const half = nearest(crossing, turns + 0.5);

  if (half === undefined) {
    // This is level 1 and level 2. Neither has a half turn to offer, so no prop
    // in them can leave radial — the request is honestly unreachable.
    return {
      motion,
      satisfied: false,
      reason: `level ${level} has no half turn, so no prop in it can change layer`,
    };
  }

  return { motion: { ...motion, turns: half }, satisfied: true };
}

function wantsLeft(flip: FlipVector): boolean {
  return flip === "B" || flip === "X";
}

function wantsRight(flip: FlipVector): boolean {
  return flip === "R" || flip === "X";
}

function withMotions(step: SequenceStep, left: Motion, right: Motion): SequenceStep {
  return { ...step, motions: { ...step.motions, left, right } };
}

/**
 * Rewrite a sequence's turns so it walks the layers the pattern describes.
 *
 * Step 0 is the start placement and carries no turns, so the pattern's first
 * flip applies to step 1. A pattern shorter than the sequence leaves the
 * remaining steps alone; a longer one ignores its tail.
 */
export function applyLayerPattern(
  steps: readonly SequenceStep[],
  pattern: LayerPattern,
  options: LayerTargetOptions = {}
): LayerTargetResult {
  const result = [...steps];
  const misses: LayerTargetMiss[] = [];

  for (let i = 0; i < pattern.flips.length; i++) {
    const stepIndex = i + 1;
    const step = result[stepIndex];
    if (!step) break;

    const flip = pattern.flips[i]!;
    const left = retargetMotionFlip(step.motions.left, wantsLeft(flip), options);
    const right = retargetMotionFlip(step.motions.right, wantsRight(flip), options);

    if (!left.satisfied) {
      misses.push({ stepIndex, hand: "left", reason: left.reason ?? "unreachable" });
    }
    if (!right.satisfied) {
      misses.push({ stepIndex, hand: "right", reason: right.reason ?? "unreachable" });
    }

    result[stepIndex] = withMotions(step, left.motion, right.motion);
  }

  return { steps: result, satisfied: misses.length === 0, misses };
}

/**
 * Make each prop cross an odd or even number of times across the whole
 * sequence, without dictating which steps do the crossing.
 *
 * An even count returns both props to the layer they started in, so the
 * sequence looks the same on every repeat. An odd count deliberately does not:
 * the layers only come back around after a second pass, which is how a
 * four-repetition orientation cycle is asked for.
 *
 * Only the steps that need to change are touched, and the last workable step is
 * preferred so the opening of the sequence keeps whatever the generator rolled.
 */
export function enforceHandFlipParity(
  steps: readonly SequenceStep[],
  parity: "odd" | "even",
  options: LayerTargetOptions = {}
): LayerTargetResult {
  const result = [...steps];
  const misses: LayerTargetMiss[] = [];
  const target = parity === "odd" ? 1 : 0;

  for (const hand of ["left", "right"] as const) {
    let crossings = 0;
    for (let i = 1; i < result.length; i++) {
      if (flipsLayer(result[i]!.motions[hand])) crossings++;
    }
    if (crossings % 2 === target) continue;

    let repaired = false;
    for (let i = result.length - 1; i >= 1; i--) {
      const step = result[i]!;
      const motion = step.motions[hand];
      const retarget = retargetMotionFlip(motion, !flipsLayer(motion), options);
      if (!retarget.satisfied) continue;

      result[i] = withMotions(
        step,
        hand === "left" ? retarget.motion : step.motions.left,
        hand === "right" ? retarget.motion : step.motions.right
      );
      repaired = true;
      break;
    }

    if (!repaired) {
      misses.push({
        stepIndex: -1,
        hand,
        reason: `no step could change its crossing to reach ${parity} parity`,
      });
    }
  }

  return { steps: result, satisfied: misses.length === 0, misses };
}
