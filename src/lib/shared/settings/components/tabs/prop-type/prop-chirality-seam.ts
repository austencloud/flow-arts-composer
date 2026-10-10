import {
  getSettings,
  updateSettings,
} from "#lib/shared/application/state/app-state.svelte.js";
import type { HandSide } from "@tka/tka-types";

export type ChiralityHand = HandSide;

export interface PropChiralityHandState {
  readonly hand: ChiralityHand;
  readonly flipped: boolean;
}

export interface PropChiralitySeam {
  /**
   * The hands this picker governs, left first. A picker that chooses one
   * hand's prop carries one entry; a picker that sets both hands at once
   * carries both, because chirality is never shared the way prop type is.
   */
  readonly hands: readonly PropChiralityHandState[];
  onChange: (hand: ChiralityHand, flipped: boolean) => void;
}

/**
 * The chirality seam for hosts whose prop picker edits the global preference —
 * which is all of them except the deck releaser, whose cards are canonical.
 *
 * `flipped` is a getter rather than a snapshot so a seam built inline in markup
 * still tracks the setting: the picker reads it during its own render, which is
 * what registers the dependency.
 *
 * Passing no hand yields BOTH hands as separate controls rather than one
 * control writing both. Buugeng chirality is a statement about how the two
 * props relate — two of the same handedness stay apart, two of opposite
 * handedness nest into one shape — so forcing them equal removes the only
 * distinction the setting exists to make. Prop type still travels together in
 * those hosts; chirality does not.
 */
export function createGlobalChiralitySeam(
  hand?: ChiralityHand
): PropChiralitySeam {
  const handState = (which: ChiralityHand): PropChiralityHandState => ({
    hand: which,
    get flipped() {
      const settings = getSettings();
      return (
        (which === "right"
          ? settings.rightBuugengFlipped
          : settings.leftBuugengFlipped) ?? false
      );
    },
  });

  return {
    hands: hand ? [handState(hand)] : [handState("left"), handState("right")],
    onChange(which: ChiralityHand, flipped: boolean) {
      updateSettings(
        which === "right"
          ? { rightBuugengFlipped: flipped }
          : { leftBuugengFlipped: flipped }
      );
    },
  };
}
