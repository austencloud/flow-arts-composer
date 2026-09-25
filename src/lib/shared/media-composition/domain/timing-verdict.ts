import {
  PLAYBACK_MAX_BPM,
  PLAYBACK_MIN_BPM,
} from "$lib/shared/animation-engine/domain/constants/timing";
import {
  fitTapsToGrid,
  type TapFitResult,
} from "$lib/shared/media-composition/domain/tap-fit";

/**
 * Says whether a fit can be trusted, in terms Austen can act on.
 *
 * The fitter always returns a grid, and with a wrong BPM it returns a
 * confident-looking wrong one: labels skip, misses pile up, and nothing on
 * screen says the typed tempo is the problem. A slow take recorded at its own
 * tempo is the common case - type 87 over a 50 BPM take and every label is
 * nonsense. So the verdict compares the fit with what the taps alone imply
 * and names the fix.
 */

/** Taps needed before the spacing of the taps says anything about tempo. */
export const MIN_TAPS_FOR_TEMPO = 6;
const MIN_MATCHED_FOR_VERDICT = 4;
/** Shares of one beat. */
const GOOD_MEDIAN_MISS = 0.12;
const GOOD_WORST_MISS = 0.3;
const GOOD_MISSED_SHARE = 0.25;
/** A fitted tempo this close to the ±5% search edge wanted to go further. */
const TEMPO_EDGE = 0.045;
/** Taps implying a tempo this far from the typed one disagree with it. */
const TEMPO_DISAGREEMENT = 0.06;
/** Two taps closer than this are one press bouncing, not two landings. */
const DOUBLE_PRESS_SECONDS = 0.15;

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function roundBpm(bpm: number): number {
  return Math.min(
    PLAYBACK_MAX_BPM,
    Math.max(PLAYBACK_MIN_BPM, Math.round(bpm * 2) / 2)
  );
}

/**
 * The tempo the taps imply on their own, to the half BPM, or null with too
 * few taps. Each gap between taps is one move, so the typical gap over the
 * typical move length is a beat; a missed tap only doubles one gap, which the
 * median ignores. The estimate is then settled by fitting the taps at it.
 */
export function suggestBpmFromTaps(
  taps: readonly number[],
  moveBeats: readonly number[]
): number | null {
  const sorted = taps
    .filter((tap) => Number.isFinite(tap))
    .sort((left, right) => left - right);
  if (sorted.length < MIN_TAPS_FOR_TEMPO) return null;
  const gaps = sorted
    .slice(1)
    .map((tap, index) => tap - sorted[index]!)
    .filter((gap) => gap >= DOUBLE_PRESS_SECONDS);
  if (gaps.length < MIN_TAPS_FOR_TEMPO - 1) return null;
  const secondsPerBeat = median(gaps) / median(moveBeats);
  const estimate = roundBpm(60 / secondsPerBeat);
  const settled = fitTapsToGrid({
    taps: sorted,
    bpm: estimate,
    moveBeats,
    firstTapPosition: 1,
    tempo: "follow",
  });
  return roundBpm(settled.bpm);
}

export type TimingVerdict =
  /** Too few matched taps to judge. */
  | { kind: "tapping" }
  /** Tight fit at a tempo the taps agree with. */
  | { kind: "good" }
  /** The typed BPM is wrong; the taps suggest this one. */
  | { kind: "tempo"; suggestedBpm: number }
  /** The tempo is plausible but the taps sit loosely on the grid. */
  | {
      kind: "rough";
      medianMissBeats: number;
      worstMissBeats: number;
      missedShare: number;
    };

export function judgeTimingFit(input: {
  fit: TapFitResult;
  typedBpm: number;
  tempo: "locked" | "follow";
  taps: readonly number[];
  moveBeats: readonly number[];
}): TimingVerdict {
  const { fit } = input;
  const matched = fit.labels.filter((label) => label.position !== null).length;
  if (matched < MIN_MATCHED_FOR_VERDICT) return { kind: "tapping" };

  const beat = fit.secondsPerBeat;
  const medianMissBeats = fit.medianMissSeconds / beat;
  const worstMissBeats = fit.worstMissSeconds / beat;
  const missedShare =
    fit.missedPositions.length / (fit.missedPositions.length + matched);
  const atTempoEdge =
    input.tempo === "follow" &&
    Math.abs(fit.bpm / input.typedBpm - 1) > TEMPO_EDGE;
  const loose =
    medianMissBeats > GOOD_MEDIAN_MISS ||
    worstMissBeats > GOOD_WORST_MISS ||
    missedShare > GOOD_MISSED_SHARE;

  if (fit.octaveHint) {
    return {
      kind: "tempo",
      suggestedBpm: roundBpm(
        fit.octaveHint === "half" ? input.typedBpm / 2 : input.typedBpm * 2
      ),
    };
  }
  if (loose || atTempoEdge) {
    const suggested = suggestBpmFromTaps(input.taps, input.moveBeats);
    if (
      suggested !== null &&
      Math.abs(suggested / input.typedBpm - 1) > TEMPO_DISAGREEMENT
    ) {
      return { kind: "tempo", suggestedBpm: suggested };
    }
  }
  if (loose) {
    return { kind: "rough", medianMissBeats, worstMissBeats, missedShare };
  }
  return { kind: "good" };
}
