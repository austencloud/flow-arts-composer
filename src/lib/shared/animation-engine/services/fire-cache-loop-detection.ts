// Decides when the fire renderer's frame cache may be replayed across a loop
// boundary and when a playback jump forces it to resynchronise. Pure
// predicates over step clocks; the render loop feeds them each frame.

/** A backwards step jump becomes a fire-cache loop boundary only when it
 * crosses the known sequence end into its start window. This excludes seeks
 * such as beat 3 → beat 1. Playback is one-based: a four-count
 * sequence runs from 1 through 5, then wraps back to 1. */
export function isConfirmedFireCacheLoop(
  previousStep: number,
  currentStep: number,
  sequenceSteps: number | undefined,
  loopDetected: boolean,
  isPlaying: boolean
): boolean {
  return (
    isPlaying &&
    loopDetected &&
    sequenceSteps !== undefined &&
    sequenceSteps > 0 &&
    previousStep >= sequenceSteps + 1 - 0.5 &&
    currentStep >= 1 &&
    currentStep <= 1.5
  );
}

/** Cache frames are only phase-safe while playback changes continuously. */
export function hasFireCachePlaybackDiscontinuity(
  previousStep: number,
  currentStep: number,
  isPlaying: boolean,
  dtSeconds: number,
  stepChangedWhilePaused: boolean,
  tipGapDetected: boolean,
  confirmedLoop: boolean
): boolean {
  return (
    tipGapDetected ||
    (!confirmedLoop &&
      (stepChangedWhilePaused ||
        Math.abs(currentStep - previousStep) > 0.5 ||
        (isPlaying && dtSeconds > 0.2)))
  );
}
