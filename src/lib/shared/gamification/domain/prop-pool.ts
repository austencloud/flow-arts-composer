/**
 * Prop unlock pool + milestone math.
 *
 * CORE_PROPS are always selectable (preserve "play with everything"); they are
 * never stored. UNLOCKABLE_POOL is the play-earned set. Milestones use triangular
 * thresholds: milestone n fires when creationCount reaches n(n+1)/2.
 */
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

/**
 * Master switch for the play-to-unlock mechanic. When false, every prop is
 * selectable from the start and no picks / badges / toasts fire — the whole
 * celebration machine stays wired. Flip back to true to re-enable earning.
 */
export const PROP_LOCKING_ENABLED = false;

/** Everyday spinning props — always open, never stored. */
export const CORE_PROPS: readonly PropType[] = [
  PropType.STAFF,
  PropType.CLUB,
  PropType.CLASSIC_CLUB,
  PropType.FAN,
  PropType.BUUGENG,
  PropType.TRIAD,
  PropType.MINIHOOP,
];

/** Exotic + variant props earned through play. */
export const UNLOCKABLE_POOL: readonly PropType[] = [
  PropType.SWORD,
  PropType.CHICKEN,
  PropType.GUITAR,
  PropType.DOUBLESTAR,
  PropType.QUIAD,
  PropType.TRIQUETRA,
  PropType.TRIQUETRA2,
  PropType.TRIGENG,
  PropType.EIGHTRINGS,
  PropType.TORCH,
  PropType.DOUBLECONTACTBALL,
  PropType.BIGSTAFF,
  PropType.BIGCLUB,
  PropType.BIGFAN,
  PropType.BIGTRIAD,
  PropType.BIGHOOP,
  PropType.BIGBUUGENG,
  PropType.BIGEIGHTRINGS,
  PropType.BIGTORCH,
  PropType.BIGCHICKEN,
  PropType.BIGDOUBLESTAR,
];

/** Triangular threshold for milestone n (1-based): n(n+1)/2. */
export function milestoneThreshold(n: number): number {
  return (n * (n + 1)) / 2;
}

/** Largest n whose triangular threshold is <= count. */
export function milestonesReached(count: number): number {
  if (count < 1) return 0;
  return Math.floor((Math.sqrt(8 * count + 1) - 1) / 2);
}
