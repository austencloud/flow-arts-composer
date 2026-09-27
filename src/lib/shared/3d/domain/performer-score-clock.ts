import type { CharacterInstanceState } from "../state/character-instance-state.svelte";

/**
 * The score time a performer's planned motion reads this frame: the torso
 * turn, the displaced props and the contact history all take it from here, so
 * they cannot disagree about which moment of the score is on stage.
 *
 * The static start pose plays before beat 1 and again at each loop seam,
 * while the clock already runs 0 to 1. It holds where beat 1 starts, so the
 * step into beat 1 and the seam are playback, and nothing jumps there. Read
 * raw, the start pose would turn the torso through beat 1 while the props
 * stood still, then snap it back as beat 1 began.
 */
export function performerScoreClock(
  performer: Pick<
    CharacterInstanceState,
    "currentStepIndex" | "motionStepOffset" | "scoreTime"
  >
): number {
  return performer.currentStepIndex < performer.motionStepOffset
    ? 0
    : performer.scoreTime;
}
