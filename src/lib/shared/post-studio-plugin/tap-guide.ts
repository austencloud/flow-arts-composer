/**
 * What the next tap marks, so the tap screen can show it before Austen taps.
 * Position 0 is the start position and position p is move p's landing; a
 * staggered performer is the same count some landings behind, holding the
 * start position until its turn.
 */

/** A tap and the landing the fit gave it; null for an extra it ignored. */
export interface TapLabel {
  seconds: number;
  position: number | null;
}

/** The landing the next tap at `seconds` marks. */
export function nextTapPosition(
  labels: readonly TapLabel[],
  firstTapPosition: number,
  seconds: number
): number {
  const matched = labels.filter(
    (label): label is { seconds: number; position: number } =>
      label.position !== null
  );
  let last: number | null = null;
  for (const label of matched) {
    // The playhead follows the video a frame behind the tap it just took.
    if (label.seconds <= seconds + 0.05) last = label.position;
  }
  if (last !== null) return last + 1;
  // Scrubbed back before the first tap: the next tap re-marks that one.
  return matched[0]?.position ?? firstTapPosition;
}

export interface TapGuidePose {
  /** 0 is the start position; otherwise the move whose landing this is. */
  position: number;
  /** Index into the sequence's steps, or null for the start position. */
  stepIndex: number | null;
}

export function tapGuidePose(
  position: number,
  stepCount: number
): TapGuidePose {
  const at = Math.max(0, position);
  return {
    position: at,
    stepIndex: at === 0 || stepCount === 0 ? null : (at - 1) % stepCount,
  };
}

/** The front performer's pose and each follower's, at one landing. */
export function tapGuidePoses(
  position: number,
  beatsBehind: readonly number[],
  stepCount: number
): { leader: TapGuidePose; followers: TapGuidePose[] } {
  return {
    leader: tapGuidePose(position, stepCount),
    followers: beatsBehind.map((behind) =>
      tapGuidePose(position - behind, stepCount)
    ),
  };
}
