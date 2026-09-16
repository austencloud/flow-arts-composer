/**
 * Shared types for the Learn module's domain constants.
 *
 * Only types that are genuinely identical across sibling constant files live
 * here. Types that look similar but diverge in their value sets are deliberately
 * NOT consolidated (see note below), because folding them together would erase a
 * real semantic distinction.
 *
 * NOT consolidated, on purpose:
 * - `HandPosition` exists as a 4-point cardinal union (`N|E|S|W`, the staff/motion
 *   visualizers) and an 8-point union (`N|NE|E|...|NW`, the word/position quizzes).
 *   These are different coordinate domains; `motion-visualizer-data.ts` and
 *   `word-visualizer-data.ts` already disambiguate them as `HandPosition4` /
 *   `HandPosition8`.
 * - `MotionType` is `shift|dash|static` (hand-path family, in the motion files)
 *   in some files and `pro|anti|hybrid` (prop rotation) in the word files. Wholly
 *   different value sets — merging would type-check nonsense.
 * - `GridPoint` is `{x,y}` in some files and `{x,y,label}` in others. Different
 *   shapes; merging would force a `label` onto consumers that don't carry one.
 */

/** Family classification for a hands placement: opposite (alpha), same (beta), or right-angle (gamma). */
export type PlacementType = "alpha" | "beta" | "gamma";

/**
 * VTG (Velocity-Timing-Direction) mode.
 * S/T/Q = Split / Together / Quarter (hand timing); S/O = Same / Opposite (direction).
 */
export type VTGMode = "SS" | "TS" | "SO" | "TO" | "QS" | "QO";

/**
 * Fisher-Yates shuffle — unbiased, unlike `arr.sort(() => Math.random() - 0.5)`
 * which is non-uniform. Returns a new array; does not mutate the input.
 */
export function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}
