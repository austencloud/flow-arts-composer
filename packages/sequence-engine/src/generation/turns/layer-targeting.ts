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
import {
  calculateEndOrientation,
  RADIAL_CW_CYCLE,
} from "../../core/orientation/OrientationCalculator.js";
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

export interface LayerCrossingOptions extends LayerTargetOptions {
  /**
   * Both hands share one turn value on every step ("Match turns", or a prop
   * timing). The crossing then goes on both hands, with the same value on
   * each, so the turn counts still agree afterwards.
   */
  matchHands?: boolean;
  /**
   * Never change the orientation each prop ends the sequence in. Set it for a
   * LOOP seed: the passes a LOOP needs to close are counted from that ending,
   * and a seed pushed to close on a different count gets regenerated (or, for
   * a one-step seed, can get stuck in a length the request cannot take).
   */
  keepClosure?: boolean;
  /** Injectable entropy for tests; defaults to Math.random. */
  random?: () => number;
}

type Hand = "left" | "right";

function hasRotation(motion: Motion): boolean {
  const rotation = String(motion.rotationDirection ?? "").toLowerCase();
  return rotation !== "" && rotation !== "norotation" && rotation !== "no_rot";
}

/**
 * A dash or static that held still has no rotation direction, and a half turn
 * needs one. Borrow the hand's last real direction so the spin carries on, or
 * fall back to clockwise.
 */
function withRotation(
  motion: Motion,
  steps: readonly SequenceStep[],
  stepIndex: number,
  hand: Hand
): Motion {
  if (hasRotation(motion)) return motion;
  for (let i = stepIndex - 1; i >= 1; i--) {
    const previous = steps[i]!.motions[hand];
    if (hasRotation(previous)) {
      return { ...motion, rotationDirection: previous.rotationDirection };
    }
  }
  return { ...motion, rotationDirection: "cw" as Motion["rotationDirection"] };
}

/** One way to make one step's prop(s) cross. */
interface CrossingMove {
  readonly stepIndex: number;
  readonly motions: Partial<Record<Hand, Motion>>;
  /**
   * How far round the eight-point orientation cycle the change moves where
   * each prop ends up, mod 8. A half turn always moves it two points one way
   * or the other.
   */
  readonly shift: Partial<Record<Hand, number>>;
  /** True when no motion had to borrow a rotation direction to take the turn. */
  readonly clean: boolean;
}

const mod8 = (n: number): number => ((n % 8) + 8) % 8;

/**
 * How far round the eight-point radial cycle this motion turns a prop, read
 * from the same calculator propagation uses. Every radial rule there (whole
 * turns, half turns, floats) is a fixed step round the cycle whatever the
 * start, so this from "in" holds for any radial start, and the steps of a
 * whole sequence add up to where each prop finishes.
 */
function cycleSteps(motion: Motion): number {
  const end = calculateEndOrientation({
    motionType: motion.motionType,
    turns: motion.turns ?? 0,
    rotationDirection: motion.rotationDirection || "cw",
    startLocation: motion.startLocation,
    endLocation: motion.endLocation,
    startOrientation: "in",
  });
  return mod8(RADIAL_CW_CYCLE.indexOf(end));
}

/**
 * Every half turn this motion could take to cross, each with how far it moves
 * where the prop ends up. The values either side of the current one are
 * offered, because the two move the prop opposite ways round, and the pairing
 * below needs that.
 */
function crossingTurns(
  motion: Motion,
  steps: readonly SequenceStep[],
  stepIndex: number,
  hand: Hand,
  options: LayerTargetOptions
): { moves: Array<{ motion: Motion; shift: number; turns: number }>; reason?: string } {
  const nudged = retargetMotionFlip(motion, true, options);
  if (!nudged.satisfied || typeof nudged.motion.turns !== "number") {
    return { moves: [], reason: nudged.reason };
  }
  const { crossing } = turnChoices(options);
  const turns = typeof motion.turns === "number" ? motion.turns : 0;
  const values = new Set<number>([
    nudged.motion.turns,
    ...crossing.filter((v) => Math.abs(v - turns) === 0.5),
  ]);
  const before = cycleSteps(motion);
  const moves: Array<{ motion: Motion; shift: number; turns: number }> = [];
  for (const value of values) {
    const next = withRotation({ ...motion, turns: value }, steps, stepIndex, hand);
    moves.push({ motion: next, shift: mod8(cycleSteps(next) - before), turns: value });
    // A prop that held still has no direction of its own, so it can spin
    // either way. The other way turns it round the opposite way, which is
    // often what a crossing elsewhere on the hand needs to come back.
    if (!hasRotation(motion)) {
      const other = {
        ...next,
        rotationDirection: (String(next.rotationDirection).toLowerCase() === "ccw"
          ? "cw"
          : "ccw") as Motion["rotationDirection"],
      };
      moves.push({ motion: other, shift: mod8(cycleSteps(other) - before), turns: value });
    }
  }
  return { moves };
}

/** The ways one step can cross: one hand at a time, or both with equal turns. */
function crossingMoves(
  steps: readonly SequenceStep[],
  stepIndex: number,
  options: LayerCrossingOptions
): { moves: CrossingMove[]; reason?: string } {
  const step = steps[stepIndex]!;
  const left = crossingTurns(step.motions.left, steps, stepIndex, "left", options);
  const right = crossingTurns(step.motions.right, steps, stepIndex, "right", options);
  const reason = left.reason ?? right.reason;
  const leftClean = hasRotation(step.motions.left);
  const rightClean = hasRotation(step.motions.right);
  const moves: CrossingMove[] = [];

  if (options.matchHands) {
    for (const l of left.moves) {
      for (const r of right.moves) {
        if (r.turns !== l.turns) continue;
        moves.push({
          stepIndex,
          motions: { left: l.motion, right: r.motion },
          shift: { left: l.shift, right: r.shift },
          clean: leftClean && rightClean,
        });
      }
    }
    return { moves, reason };
  }

  for (const l of left.moves) {
    moves.push({
      stepIndex,
      motions: { left: l.motion },
      shift: { left: l.shift },
      clean: leftClean,
    });
  }
  for (const r of right.moves) {
    moves.push({
      stepIndex,
      motions: { right: r.motion },
      shift: { right: r.shift },
      clean: rightClean,
    });
  }
  return { moves, reason };
}

/** Two moves on the same hand(s) whose shifts cancel round the cycle. */
function cancels(a: CrossingMove, b: CrossingMove): boolean {
  for (const hand of ["left", "right"] as const) {
    const sa = a.shift[hand];
    const sb = b.shift[hand];
    if ((sa === undefined) !== (sb === undefined)) return false;
    if (sa !== undefined && mod8(sa + sb!) !== 0) return false;
  }
  return true;
}

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length) % items.length]!;
}

/**
 * Make sure a level 3 sequence leaves radial at least once.
 *
 * Level 3 is the level where props can sit clock or counter, and the difficulty
 * badge reads it that way. Turn allocation rolls each step at random, though,
 * so nothing stops every roll from landing on a whole turn, and a rolled float
 * on a dash or static quietly becomes zero turns. When that happens the
 * sequence never crosses and reads as level 2. This finds that case after the
 * motions are settled and adds the crossing.
 *
 * It adds the crossing as a pair on one prop: out of radial on one step and
 * back on a later one, the second half turn moving the prop the opposite way
 * round. The prop then ends the sequence in exactly the orientation it would
 * have without them, so a LOOP built on it closes after the same number of
 * passes as before, whatever the LOOP does to the hands (rotate, mirror, swap,
 * invert or rewind all act on both half turns alike, so they still cancel). A
 * single crossing would leave the prop a quarter of the way round at the end,
 * and the LOOP would need twice the passes to come home. When no such pair
 * exists (a one-step sequence, say) it falls back to one crossing, unless
 * `keepClosure` says where the props end up must not change; then it leaves
 * the sequence alone and reports the miss.
 *
 * Below level 3 nothing is touched: those levels are radial by definition. A
 * sequence that already crosses is returned as it is. The steps are chosen at
 * random among the workable ones, preferring props that already spin a known
 * way. With matched hands both props cross on the same steps with the same
 * turn values, so their turn counts stay equal.
 */
export function ensureLayerCrossing(
  steps: readonly SequenceStep[],
  options: LayerCrossingOptions = {}
): LayerTargetResult {
  const level = options.level ?? DEFAULT_LEVEL;
  if (level < 3) return { steps: [...steps], satisfied: true, misses: [] };

  for (let i = 1; i < steps.length; i++) {
    const { left, right } = steps[i]!.motions;
    if (flipsLayer(left) || flipsLayer(right)) {
      return { steps: [...steps], satisfied: true, misses: [] };
    }
  }

  const perStep: CrossingMove[][] = [];
  let reason: string | undefined;
  for (let i = 1; i < steps.length; i++) {
    const found = crossingMoves(steps, i, options);
    reason ??= found.reason;
    perStep.push(found.moves);
  }

  const pairs: Array<{ moves: CrossingMove[]; clean: boolean }> = [];
  for (let a = 0; a < perStep.length; a++) {
    for (let b = a + 1; b < perStep.length; b++) {
      for (const first of perStep[a]!) {
        for (const second of perStep[b]!) {
          if (!cancels(first, second)) continue;
          pairs.push({ moves: [first, second], clean: first.clean && second.clean });
        }
      }
    }
  }
  const singles = perStep.flat().map((move) => ({ moves: [move], clean: move.clean }));
  const candidates =
    pairs.length > 0 ? pairs : options.keepClosure ? [] : singles;

  if (candidates.length === 0) {
    const why =
      singles.length > 0
        ? "no two steps can cross out and back on one prop, and a single " +
          "crossing would change where the props end up"
        : (reason ??
          (options.matchHands
            ? "no step could give both hands the same half turn"
            : "no step could take a half turn"));
    return {
      steps: [...steps],
      satisfied: false,
      misses: [
        { stepIndex: -1, hand: "left", reason: why },
        { stepIndex: -1, hand: "right", reason: why },
      ],
    };
  }

  const clean = candidates.filter((c) => c.clean);
  const chosen = pick(clean.length > 0 ? clean : candidates, options.random ?? Math.random);

  const result = [...steps];
  for (const move of chosen.moves) {
    const step = result[move.stepIndex]!;
    result[move.stepIndex] = withMotions(
      step,
      move.motions.left ?? step.motions.left,
      move.motions.right ?? step.motions.right
    );
  }
  return { steps: result, satisfied: true, misses: [] };
}
