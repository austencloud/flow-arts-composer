import type { SequenceData } from "../domain/models/sequence-data";
import type { AuthoredHand } from "../domain/models/authored-hand";
import { isVisibleMotion } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

export type { AuthoredHand } from "../domain/models/authored-hand";
export type SoloMotionHand = HandSide;

export type SequenceMotionProfile =
  | { readonly kind: "empty" }
  | {
      readonly kind: "solo";
      readonly hand: SoloMotionHand;
      readonly authoredHand: AuthoredHand;
    }
  | { readonly kind: "paired" }
  | { readonly kind: "mixed" };

export interface SequenceMotionVisibility {
  readonly showLeftMotion: boolean;
  readonly showRightMotion: boolean;
}

export function authoredHandForMotionHand(hand: SoloMotionHand): AuthoredHand {
  return hand === HandSide.LEFT ? "left" : "right";
}

export function motionHandForAuthoredHand(hand: AuthoredHand): SoloMotionHand {
  return hand === "left" ? HandSide.LEFT : HandSide.RIGHT;
}

/**
 * Classifies the choreography that is actually present in the steps.
 *
 * Start-position props do not make a hand part of the choreography, and
 * invisible placeholders count as absent. Fully blank beats are ignored.
 */
export function getSequenceMotionProfile(
  sequence: Pick<SequenceData, "steps">
): SequenceMotionProfile {
  let hasLeft = false;
  let hasRight = false;
  let hasUnpairedContent = false;

  for (const step of sequence.steps ?? []) {
    const left = isVisibleMotion(step.motions?.left);
    const right = isVisibleMotion(step.motions?.right);
    if (!left && !right) continue;

    hasLeft ||= left;
    hasRight ||= right;
    hasUnpairedContent ||= left !== right;
  }

  if (!hasLeft && !hasRight) return { kind: "empty" };
  if (hasLeft && !hasRight) {
    return { kind: "solo", hand: HandSide.LEFT, authoredHand: "left" };
  }
  if (hasRight && !hasLeft) {
    return { kind: "solo", hand: HandSide.RIGHT, authoredHand: "right" };
  }
  return hasUnpairedContent ? { kind: "mixed" } : { kind: "paired" };
}

export function getSequenceMotionVisibility(
  sequence: Pick<SequenceData, "steps">
): SequenceMotionVisibility {
  const profile = getSequenceMotionProfile(sequence);
  if (profile.kind !== "solo") {
    return { showLeftMotion: true, showRightMotion: true };
  }

  return {
    showLeftMotion: profile.hand === HandSide.LEFT,
    showRightMotion: profile.hand === HandSide.RIGHT,
  };
}
