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
  /**
   * The position the earliest matched tap lands on. 1 is move 1's landing.
   * Ignored when `beatOneSeconds` is set.
   */
  firstTapPosition: number;
  /**
   * A moment Austen marked as move 1's landing. The landing nearest it is
   * position 1 however the taps start, so a tap on the opening pose, a stray
   * before the performer starts, or tapping from partway in cannot shift the
   * labels. Taps that fall before the opening pose are extras.
   */
  beatOneSeconds?: number | null;
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
  /**
   * Taps before the first one the fit used; their labels are null. Usually a
   * key pressed while the performer was getting ready, but a real first tap
   * followed by several missed landings looks the same, so the UI asks.
   * Marking beat 1 settles it, and the count is then always 0.
   */
  ignoredLeadingTaps: number;
}

const COMB_SIGMA_SECONDS = 0.04;
const TEMPO_SEARCH_SPAN = 0.05;
const TEMPO_SEARCH_STEP = 0.001;
const PHASE_SEARCH_STEP_SECONDS = 0.004;
const HUBER_SECONDS = 0.04;
const REFINE_ITERATIONS = 8;
/** A tap farther than this share of the shortest move is not that landing. */
const MATCH_TOLERANCE = 0.35;
/**
 * A first tap more than this many landings before the next is a stray...
 *
 * A seeded sweep (60 takes each, one pre-roll tap 0.8-3.8 s early) found the
 * rule halves wrong maps at a 10% miss rate and costs nothing there; at 40%
 * missed it wrongly drops a real first tap in 5 of 60. Beat 1 marked
 * explicitly overrides it either way.
 */
const MAX_LEADING_GAP_LANDINGS = 3;
/** ...provided enough taps follow it to fit the grid without it. */
const MIN_RUN_AFTER_STRAY = 3;
/** Taps closer than this are one press registered twice. */
const DUPLICATE_TAP_SECONDS = 0.001;
/**
 * Tempo stays at the typed BPM until the taps span this many beats (one pass,
 * within these bounds): over a few moves, tapping jitter reads as tempo.
 */
const MIN_TEMPO_SPAN_BEATS = 8;
const MAX_TEMPO_SPAN_BEATS = 16;
/**
 * The coarse search scores this many taps, spread across the take; the fine
 * search and refit use them all. A 130 s take has ~190 taps.
 */
const COARSE_SEARCH_TAPS = 48;

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

  /**
   * Beats from position 0 to position p. Integer p only; a negative p counts
   * back from the opening pose through the previous pass.
   */
  function beatsBefore(position: number): number {
    const pass = Math.floor(position / movesPerPass);
    const within = position - pass * movesPerPass;
    return pass * beatsPerPass + cumulative[within]!;
  }

  /**
   * The position whose landing is nearest to `beats` from the opening pose;
   * a tie goes to the earlier one.
   */
  function nearestPosition(beats: number): number {
    if (beats <= 0) return 0;
    const pass = Math.floor(beats / beatsPerPass);
    const within = beats - pass * beatsPerPass;
    // The last landing at or before `within`, by bisection: the comb calls
    // this for every tap under every hypothesis.
    let low = 0;
    let high = movesPerPass;
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if (cumulative[middle]! <= within) low = middle;
      else high = middle;
    }
    const nearer =
      within - cumulative[low]! <= cumulative[low + 1]! - within
        ? low
        : low + 1;
    return pass * movesPerPass + nearer;
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

/** Where the first phase window sits: on the beat-1 mark, or the first tap. */
interface PhaseSeed {
  seconds: number;
  position: number;
}

/**
 * Searches phase for each candidate tempo. The phase window is one shortest
 * move either side of where the seed would put the origin, which covers
 * every phase of a uniform sequence without assuming the first tap is clean.
 */
function searchGrid(
  taps: readonly number[],
  clock: BeatClock,
  tempos: readonly number[],
  seed: PhaseSeed,
  phaseStep: number,
  phaseWindow?: { center: number; reach: number }
): GridHypothesis {
  let best: GridHypothesis | null = null;
  for (const secondsPerBeat of tempos) {
    const center =
      phaseWindow?.center ??
      seed.seconds - secondsPerBeat * clock.beatsBefore(seed.position);
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

/** At most `count` taps, evenly spread, keeping the first and last. */
function spreadSubset(taps: readonly number[], count: number): number[] {
  if (taps.length <= count) return [...taps];
  const stride = (taps.length - 1) / (count - 1);
  return Array.from(
    { length: count },
    (_, index) => taps[Math.round(index * stride)]!
  );
}

/**
 * Coarse pass over every tempo and phase, then a fine pass around the best.
 * The comb's 40 ms kernel is wide enough that a 12 ms coarse step cannot step
 * over its peak. The coarse pass scores a spread subset of the taps, which
 * keeps a full-take refit near a tenth of a second.
 */
function searchGridCoarseToFine(
  taps: readonly number[],
  clock: BeatClock,
  nominal: number,
  lockTempo: boolean,
  seed: PhaseSeed
): GridHypothesis {
  const coarseTaps = spreadSubset(taps, COARSE_SEARCH_TAPS);
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
    coarseTaps,
    clock,
    coarseTempos,
    seed,
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
      seed,
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

type Anchored = {
  matched: MatchedTap[];
  /** A re-derived origin when the labels moved, else null. */
  originSeconds: number | null;
};

/**
 * Fits the grid. Needs at least one tap. Until the taps span about one pass
 * the tempo is held at the typed BPM whatever `tempo` says: over a few moves,
 * tapping jitter cannot be told from a tempo error.
 */
export function fitTapsToGrid(input: TapFitInput): TapFitResult {
  if (!Number.isFinite(input.bpm) || input.bpm <= 0) {
    throw new RangeError("BPM must be positive");
  }
  const clock = createBeatClock(input.moveBeats);
  const taps: number[] = [];
  for (const tap of [...input.taps]
    .filter((tap) => Number.isFinite(tap))
    .sort((left, right) => left - right)) {
    if (
      taps.length === 0 ||
      tap - taps[taps.length - 1]! > DUPLICATE_TAP_SECONDS
    ) {
      taps.push(tap);
    }
  }
  if (taps.length === 0) {
    throw new RangeError("Tap at least once to fit a grid");
  }
  const firstTapPosition = Math.max(0, Math.round(input.firstTapPosition));
  const beatOne =
    typeof input.beatOneSeconds === "number" &&
    Number.isFinite(input.beatOneSeconds)
      ? input.beatOneSeconds
      : null;
  const nominal = 60 / input.bpm;
  const tempoSpanBeats = Math.min(
    MAX_TEMPO_SPAN_BEATS,
    Math.max(MIN_TEMPO_SPAN_BEATS, clock.beatsPerPass)
  );
  const lockTempo =
    input.tempo === "locked" ||
    taps.length < 3 ||
    (taps[taps.length - 1]! - taps[0]!) / nominal < tempoSpanBeats;
  const grid = searchGridCoarseToFine(
    taps,
    clock,
    nominal,
    lockTempo,
    beatOne === null
      ? { seconds: taps[0]!, position: firstTapPosition }
      : { seconds: beatOne, position: 1 }
  );
  const shiftLabels = (
    labelled: MatchedTap[],
    shift: number,
    secondsPerBeat: number
  ): Anchored => {
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
  // With a beat-1 mark, the landing nearest it is position 1 and nothing
  // else decides the labels.
  const anchorToBeatOne = (
    all: MatchedTap[],
    originSeconds: number,
    secondsPerBeat: number
  ): Anchored => {
    const markLabel = clock.nearestPosition(
      (beatOne! - originSeconds) / secondsPerBeat
    );
    const shift = 1 - markLabel;
    return shift === 0
      ? { matched: all, originSeconds: null }
      : shiftLabels(all, shift, secondsPerBeat);
  };
  // The earliest matched tap marks `firstTapPosition` by definition. The comb
  // may have placed it a landing off when the first tap was an extra, so
  // relabel before refining; with uneven move lengths the refit then settles
  // the grid on the corrected durations.
  const anchorToFirstTap = (
    all: MatchedTap[],
    secondsPerBeat: number
  ): Anchored => {
    // A tap well before the run - pressing the key while the performer was
    // still getting ready - would otherwise become move 1 and shift every
    // label after it. Few people miss several landings right after starting
    // to tap, so a lone tap that far ahead of the rest is set aside, and the
    // result counts it so the UI can offer it back as beat 1. The explicit
    // beat-1 mark replaces this guess.
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
    return shiftLabels(labelled, shift, secondsPerBeat);
  };
  const anchor = (
    all: MatchedTap[],
    originSeconds: number,
    secondsPerBeat: number
  ): Anchored =>
    beatOne === null
      ? anchorToFirstTap(all, secondsPerBeat)
      : anchorToBeatOne(all, originSeconds, secondsPerBeat);
  const sortedLabels = (originSeconds: number, secondsPerBeat: number) =>
    [...labelTaps(taps, clock, originSeconds, secondsPerBeat).values()].sort(
      (left, right) => left.position - right.position
    );

  const first = anchor(
    sortedLabels(grid.originSeconds, grid.secondsPerBeat),
    grid.originSeconds,
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
  const second = anchor(
    sortedLabels(fitted.originSeconds, fitted.secondsPerBeat),
    fitted.originSeconds,
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
  const firstUsed = labels.findIndex((label) => label.position !== null);
  const ignoredLeadingTaps = beatOne === null ? Math.max(0, firstUsed) : 0;

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
    ignoredLeadingTaps,
  };
}
