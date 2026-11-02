/**
 * Fresh examples of one hand combination, for the Guide's "Another example"
 * control on the six combination pages (2026-10-31). Each hand starts on a
 * random hand point (the two may share one); a shift goes to a random
 * adjacent point, either way round, a dash to the opposite point, and a
 * static hand stays. For a combination of two different moves, either hand
 * may make either move.
 */
import { rotateLocation } from "#lib/shared/create/services/rotation-helpers.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  combinationMoves,
  type ComboHand,
  type HandCombination,
  type HandMove,
} from "./hand-motions-topic.js";

export type CombinationExample = { left: ComboHand; right: ComboHand };

const HAND_POINTS = [
  GridLocation.NORTH,
  GridLocation.EAST,
  GridLocation.SOUTH,
  GridLocation.WEST,
] as const;

const pick = <T>(items: readonly T[], rng: () => number): T =>
  items[Math.min(items.length - 1, Math.floor(rng() * items.length))]!;

function randomHand(move: HandMove, rng: () => number): ComboHand {
  const from = pick(HAND_POINTS, rng);
  // Eighth turns around the grid: a quarter either way, or half way round.
  const eighths =
    move === "shift" ? pick([2, -2], rng) : move === "dash" ? 4 : 0;
  return { move, from, to: rotateLocation(from, eighths) as GridLocation };
}

const sameHand = (a: ComboHand, b: ComboHand) =>
  a.move === b.move && a.from === b.from && a.to === b.to;

/** Whether two examples draw the same picture. */
export function sameExample(
  a: CombinationExample,
  b: CombinationExample
): boolean {
  return sameHand(a.left, b.left) && sameHand(a.right, b.right);
}

/**
 * A random example of `combination`, never the same as `exclude` (the one
 * on screen). `rng` returns numbers in [0, 1), like Math.random.
 */
export function randomCombinationExample(
  combination: HandCombination,
  exclude?: CombinationExample | null,
  rng: () => number = Math.random
): CombinationExample {
  const [first, second] = combinationMoves(combination.id);
  // Every combination has at least sixteen examples, so a repeat of the one
  // on screen is rare; a few draws always find another.
  for (let attempt = 0; ; attempt++) {
    const swap = first !== second && rng() < 0.5;
    const example = {
      left: randomHand(swap ? second : first, rng),
      right: randomHand(swap ? first : second, rng),
    };
    if (!exclude || !sameExample(example, exclude) || attempt > 64)
      return example;
  }
}
