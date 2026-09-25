/**
 * Fits rough taps to a phase-aligned tempo grid.
 *
 * A performer's take has one steady tempo, and each move lasts a whole number
 * of beats. Austen types the BPM he performed to and taps along roughly; this
 * finds where the grid sits under those taps, which taps are misses or
 * extras, and - when asked - the tempo the video actually ran at.
 *
 * Positions use the arrival count: position 0 is the opening pose and p is
 * the landing of move p, counting on across passes. Position p lands at
 * `origin + secondsPerBeat * beatsBefore(p)`, where `beatsBefore` sums the
 * durations of moves 1..p, so a two-beat move sits twice as far from its
 * neighbour.
 *
 * Why a global comb search rather than walking tap to tap: walking labels each
 * tap from the one before it, so one bad tap relabels every tap after it. The
 * comb scores every (tempo, phase) hypothesis against all taps at once. A
 * seeded sweep of 1,500 simulated takes (tempo up to 3.4% off the typed BPM,
 * 40% of landings untapped, 20% extra taps) found the phase every time.
 */

export interface TapFitInput {
  /** Raw tap times, media seconds, any order. */
  taps: readonly number[];
  /** The tempo the take was performed to. */
  bpm: number;
  /** Beats each move lasts, in sequence order; length is moves per pass. */
  moveBeats: readonly number[];
  /** The position the earliest matched tap lands on. 1 is move 1's landing. */
  firstTapPosition: number;
  /** Hold the typed tempo exactly, or fit the video's own within ±5%. */
  tempo: "locked" | "follow";
}

export interface TapLabel {
  seconds: number;
  /** The landing this tap marks, or null for an extra tap the fit ignores. */
  position: number | null;
  /** Tap minus its landing, seconds. Null for extras. */
  residualSeconds: number | null;
}

export interface TapFitResult {
  secondsPerBeat: number;
  bpm: number;
  /** Media time of position 0, the opening pose. May be negative. */
  originSeconds: number;
  labels: TapLabel[];
  /** Positions between the first and last matched tap that nobody tapped. */
  missedPositions: number[];
  extraCount: number;
  medianMissSeconds: number;
  worstMissSeconds: number;
  /**
   * "half" when the taps land on every other grid landing, which means the
   * moves run at half the typed tempo; "double" when there are about two taps
   * per landing. Null when the typed tempo looks right.
   */
  octaveHint: "half" | "double" | null;
}

const COMB_SIGMA_SECONDS = 0.04;
const TEMPO_SEARCH_SPAN = 0.05;
const TEMPO_SEARCH_STEP = 0.001;
const PHASE_SEARCH_STEP_SECONDS = 0.004;
const HUBER_SECONDS = 0.04;
const REFINE_ITERATIONS = 8;
/** A tap farther than this share of the shortest move is not that landing. */
const MATCH_TOLERANCE = 0.35;
/** A first tap more than this many landings before the next is a stray... */
const MAX_LEADING_GAP_LANDINGS = 3;
/** ...provided enough taps follow it to fit the grid without it. */
const MIN_RUN_AFTER_STRAY = 3;

/** Cumulative beats from the opening pose to any position, across passes. */
export function createBeatClock(moveBeats: readonly number[]) {
  if (moveBeats.length === 0) {
    throw new RangeError("A sequence needs at least one move");
  }
  const cumulative = [0];
  for (const beats of moveBeats) {
    if (!Number.isFinite(beats) || beats <= 0) {
      throw new RangeError("Move durations must be positive beats");
    }
    cumulative.push(cumulative[cumulative.length - 1]! + beats);
  }
  const movesPerPass = moveBeats.length;
  const beatsPerPass = cumulative[movesPerPass]!;

  /** Beats from position 0 to position p. Integer p only. */
  function beatsBefore(position: number): number {
    const pass = Math.floor(position / movesPerPass);
    const within = position - pass * movesPerPass;
    return pass * beatsPerPass + cumulative[within]!;
  }

  /** The position whose landing is nearest to `beats` from the opening pose. */
  function nearestPosition(beats: number): number {
    if (beats <= 0) return 0;
    const pass = Math.floor(beats / beatsPerPass);
    let best = pass * movesPerPass;
    let bestError = Infinity;
    for (let within = 0; within <= movesPerPass; within += 1) {
      const position = pass * movesPerPass + within;
      const error = Math.abs(beatsBefore(position) - beats);
      if (error < bestError) {
        bestError = error;
        best = position;
      }
    }
    return best;
  }

  return {
    movesPerPass,
    beatsPerPass,
    shortestMove: Math.min(...moveBeats),
    beatsBefore,
    nearestPosition,
    /** Beats the move landing at position p lasts (p ≥ 1). */
    moveBeatsAt(position: number): number {
      const within = (((position - 1) % movesPerPass) + movesPerPass) %
        movesPerPass;
      return moveBeats[within]!;
    },
  };
}

type BeatClock = ReturnType<typeof createBeatClock>;

function combScore(
  taps: readonly number[],
  clock: BeatClock,
  originSeconds: number,
  secondsPerBeat: number
): number {
  let score = 0;
  for (const tap of taps) {
    const beats = (tap - originSeconds) / secondsPerBeat;
    const position = clock.nearestPosition(beats);
    const residual =
      (clock.beatsBefore(position) - beats) * secondsPerBeat;
    score += Math.exp(
      -(residual * residual) / (2 * COMB_SIGMA_SECONDS * COMB_SIGMA_SECONDS)
    );
  }
  return score;
}

interface GridHypothesis {
  originSeconds: number;
  secondsPerBeat: number;
  score: number;
}

/**
 * Searches phase for each candidate tempo. The phase window is one shortest
 * move either side of where the first tap would put the origin, which covers
 * every phase of a uniform sequence without assuming the first tap is clean.
 */
function searchGrid(
  taps: readonly number[],
  clock: BeatClock,
  tempos: readonly number[],
  firstTapPosition: number,
  phaseStep: number,
  phaseWindow?: { center: number; reach: number }
): GridHypothesis {
  let best: GridHypothesis | null = null;
  for (const secondsPerBeat of tempos) {
    const center =
      phaseWindow?.center ??
      taps[0]! - secondsPerBeat * clock.beatsBefore(firstTapPosition);
    const reach =
      phaseWindow?.reach ?? secondsPerBeat * clock.shortestMove;
    for (let offset = -reach; offset <= reach + 1e-9; offset += phaseStep) {
      const originSeconds = center + offset;
      const score = combScore(taps, clock, originSeconds, secondsPerBeat);
      if (!best || score > best.score) {
        best = { originSeconds, secondsPerBeat, score };
      }
    }
  }
  return best!;
}

/**
 * Coarse pass over every tempo and phase, then a fine pass around the best.
 * The comb's 40 ms kernel is wide enough that a 12 ms coarse step cannot step
 * over its peak, and it keeps a live refit under a few tens of milliseconds.
 */
function searchGridCoarseToFine(
  taps: readonly number[],
  clock: BeatClock,
  nominal: number,
  lockTempo: boolean,
  firstTapPosition: number
): GridHypothesis {
  const tempoRange = (step: number, around: number, span: number) => {
    const tempos: number[] = [];
    for (let ratio = -span; ratio <= span + 1e-9; ratio += step) {
      tempos.push(around * (1 + ratio));
    }
    return tempos;
  };
  const coarseTempos = lockTempo
    ? [nominal]
    : tempoRange(TEMPO_SEARCH_STEP * 2, nominal, TEMPO_SEARCH_SPAN);
  const coarse = searchGrid(
    taps,
    clock,
    coarseTempos,
    firstTapPosition,
    PHASE_SEARCH_STEP_SECONDS * 3
  );
  const fineTempos = lockTempo
    ? [nominal]
    : tempoRange(
        TEMPO_SEARCH_STEP / 4,
        coarse.secondsPerBeat,
        TEMPO_SEARCH_STEP * 2
      );
  // A tempo change pivots the grid about the taps' middle, not the origin, so
  // the fine phase window re-centres per tempo on the coarse grid's midpoint.
  const middle = taps[Math.floor(taps.length / 2)]!;
  const middleBeats = (middle - coarse.originSeconds) / coarse.secondsPerBeat;
  let best: GridHypothesis | null = null;
  for (const secondsPerBeat of fineTempos) {
    const candidate = searchGrid(
      taps,
      clock,
      [secondsPerBeat],
      firstTapPosition,
      PHASE_SEARCH_STEP_SECONDS / 2,
      {
        center: middle - middleBeats * secondsPerBeat,
        reach: PHASE_SEARCH_STEP_SECONDS * 4,
      }
    );
    if (!best || candidate.score > best.score) best = candidate;
  }
  return best!.score >= coarse.score ? best! : coarse;
}

interface MatchedTap {
  seconds: number;
  position: number;
}

/** Nearest landing per tap; one tap per landing; far taps are extras. */
function labelTaps(
  taps: readonly number[],
  clock: BeatClock,
  originSeconds: number,
  secondsPerBeat: number
): Map<number, MatchedTap> {
  const tolerance = MATCH_TOLERANCE * clock.shortestMove * secondsPerBeat;
  const byPosition = new Map<number, MatchedTap & { error: number }>();
  for (const seconds of taps) {
    const position = clock.nearestPosition(
      (seconds - originSeconds) / secondsPerBeat
    );
    const error = Math.abs(
      seconds - (originSeconds + secondsPerBeat * clock.beatsBefore(position))
    );
    if (error > tolerance) continue;
    const previous = byPosition.get(position);
    if (!previous || error < previous.error) {
      byPosition.set(position, { seconds, position, error });
    }
  }
  return byPosition;
}

/** Huber-weighted least squares for tap = origin + spb * beats. */
function refine(
  matched: readonly MatchedTap[],
  clock: BeatClock,
  start: { originSeconds: number; secondsPerBeat: number },
  lockTempo: boolean,
  nominal: number
): { originSeconds: number; secondsPerBeat: number } {
  const points = matched.map((tap) => ({
    t: tap.seconds,
    b: clock.beatsBefore(tap.position),
  }));
  let { originSeconds, secondsPerBeat } = start;
  if (points.length === 0) return { originSeconds, secondsPerBeat };
  let weights = points.map(() => 1);
  // A single point, or points on one landing, cannot fix a tempo.
  const distinctBeats = new Set(points.map((point) => point.b)).size;
  const fitTempo = !lockTempo && distinctBeats >= 2;

  for (let iteration = 0; iteration < REFINE_ITERATIONS; iteration += 1) {
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    const meanBeats =
      points.reduce((sum, point, i) => sum + weights[i]! * point.b, 0) / total;
    const meanTime =
      points.reduce((sum, point, i) => sum + weights[i]! * point.t, 0) / total;
    if (fitTempo) {
      let numerator = 0;
      let denominator = 0;
      points.forEach((point, i) => {
        numerator += weights[i]! * (point.b - meanBeats) * (point.t - meanTime);
        denominator += weights[i]! * (point.b - meanBeats) ** 2;
      });
      // The least-squares slope may wander past the promised ±5% when a few
      // taps sit far off; hold it to the span the search covered.
      if (denominator > 0) {
        secondsPerBeat = Math.min(
          nominal * (1 + TEMPO_SEARCH_SPAN),
          Math.max(nominal * (1 - TEMPO_SEARCH_SPAN), numerator / denominator)
        );
      }
    }
    originSeconds = meanTime - secondsPerBeat * meanBeats;
    weights = points.map((point) => {
      const residual = Math.abs(
        point.t - (originSeconds + secondsPerBeat * point.b)
      );
      return residual <= HUBER_SECONDS ? 1 : HUBER_SECONDS / residual;
    });
  }
  return { originSeconds, secondsPerBeat };
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function detectOctave(
  matched: readonly MatchedTap[],
  extraCount: number
): TapFitResult["octaveHint"] {
  if (matched.length >= 4) {
    let everyOther = 0;
    for (let index = 1; index < matched.length; index += 1) {
      if (matched[index]!.position - matched[index - 1]!.position === 2) {
        everyOther += 1;
      }
    }
    if (everyOther / (matched.length - 1) >= 0.8) return "half";
  }
  if (matched.length >= 4 && extraCount >= 0.7 * matched.length) {
    return "double";
  }
  return null;
}

/**
 * Fits the grid. Needs at least one tap; with fewer than three the tempo is
 * held at the typed BPM whatever `tempo` says, since two taps cannot tell a
 * tempo error from tapping jitter.
 */
export function fitTapsToGrid(input: TapFitInput): TapFitResult {
  if (!Number.isFinite(input.bpm) || input.bpm <= 0) {
    throw new RangeError("BPM must be positive");
  }
  const clock = createBeatClock(input.moveBeats);
  const taps = [...input.taps]
    .filter((tap) => Number.isFinite(tap))
    .sort((left, right) => left - right);
  if (taps.length === 0) {
    throw new RangeError("Tap at least once to fit a grid");
  }
  const firstTapPosition = Math.max(0, Math.round(input.firstTapPosition));
  const nominal = 60 / input.bpm;
  const lockTempo = input.tempo === "locked" || taps.length < 3;
  const grid = searchGridCoarseToFine(
    taps,
    clock,
    nominal,
    lockTempo,
    firstTapPosition
  );
  // The earliest matched tap marks `firstTapPosition` by definition. The comb
  // may have placed it a landing off when the first tap was an extra, so
  // relabel before refining; with uneven move lengths the refit then settles
  // the grid on the corrected durations.
  const anchorToFirstTap = (
    all: MatchedTap[],
    secondsPerBeat: number
  ): { matched: MatchedTap[]; originSeconds: number | null } => {
    // A tap well before the run - pressing the key while the performer was
    // still getting ready - would otherwise become move 1 and shift every
    // label after it. Nobody misses several landings right after starting to
    // tap, so a lone tap that far ahead of the rest is set aside as an extra.
    let startIndex = 0;
    while (
      all.length - startIndex > MIN_RUN_AFTER_STRAY &&
      all[startIndex + 1]!.position - all[startIndex]!.position >
        MAX_LEADING_GAP_LANDINGS
    ) {
      startIndex += 1;
    }
    const labelled = all.slice(startIndex);
    const shift = labelled.length
      ? firstTapPosition - labelled[0]!.position
      : 0;
    if (shift === 0) {
      return {
        matched: labelled,
        originSeconds:
          startIndex > 0
            ? labelled[0]!.seconds -
              secondsPerBeat * clock.beatsBefore(labelled[0]!.position)
            : null,
      };
    }
    const shifted = labelled
      .map((tap) => ({ ...tap, position: tap.position + shift }))
      .filter((tap) => tap.position >= 0);
    return {
      matched: shifted,
      originSeconds: shifted.length
        ? shifted[0]!.seconds -
          secondsPerBeat * clock.beatsBefore(shifted[0]!.position)
        : null,
    };
  };
  const sortedLabels = (originSeconds: number, secondsPerBeat: number) =>
    [...labelTaps(taps, clock, originSeconds, secondsPerBeat).values()].sort(
      (left, right) => left.position - right.position
    );

  const first = anchorToFirstTap(
    sortedLabels(grid.originSeconds, grid.secondsPerBeat),
    grid.secondsPerBeat
  );
  let matched = first.matched;
  let fitted = refine(
    matched,
    clock,
    {
      originSeconds: first.originSeconds ?? grid.originSeconds,
      secondsPerBeat: grid.secondsPerBeat,
    },
    lockTempo,
    nominal
  );
  // Relabel against the refined grid once: a drifting tempo can leave the
  // last passes' taps nearer a neighbour under the comb's coarser grid.
  const second = anchorToFirstTap(
    sortedLabels(fitted.originSeconds, fitted.secondsPerBeat),
    fitted.secondsPerBeat
  );
  if (second.matched.length >= matched.length) {
    matched = second.matched;
    fitted = refine(
      matched,
      clock,
      {
        originSeconds: second.originSeconds ?? fitted.originSeconds,
        secondsPerBeat: fitted.secondsPerBeat,
      },
      lockTempo,
      nominal
    );
  }

  const matchedBySeconds = new Map(matched.map((tap) => [tap.seconds, tap]));
  const labels: TapLabel[] = taps.map((seconds) => {
    const tap = matchedBySeconds.get(seconds);
    if (!tap) return { seconds, position: null, residualSeconds: null };
    return {
      seconds,
      position: tap.position,
      residualSeconds:
        seconds -
        (fitted.originSeconds +
          fitted.secondsPerBeat * clock.beatsBefore(tap.position)),
    };
  });
  const misses = labels
    .filter((label) => label.residualSeconds !== null)
    .map((label) => Math.abs(label.residualSeconds!));
  const matchedPositions = new Set(matched.map((tap) => tap.position));
  const missedPositions: number[] = [];
  if (matched.length > 1) {
    for (
      let position = matched[0]!.position;
      position <= matched[matched.length - 1]!.position;
      position += 1
    ) {
      if (!matchedPositions.has(position)) missedPositions.push(position);
    }
  }
  const extraCount = labels.length - matched.length;

  return {
    secondsPerBeat: fitted.secondsPerBeat,
    bpm: 60 / fitted.secondsPerBeat,
    originSeconds: fitted.originSeconds,
    labels,
    missedPositions,
    extraCount,
    medianMissSeconds: median(misses),
    worstMissSeconds: misses.length ? Math.max(...misses) : 0,
    octaveHint: detectOctave(matched, extraCount),
  };
}
