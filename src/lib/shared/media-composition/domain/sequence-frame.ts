import { createBeatClock } from "$lib/shared/media-composition/domain/tap-fit";

/**
 * Which move is showing, worked out once per frame so the performer, the
 * animation square, the strip pictograph, the carousel and the beat number
 * cannot disagree.
 *
 * It reads an arrival position: 0 is the opening pose, and k is the landing of
 * move k, counting on across passes. Between landings the fraction is how far
 * through that move the performer is, whatever its length in beats.
 *
 * A move owns everything from just after the previous landing up to and
 * including its own landing: at exactly r = k the frame is move k, finished.
 * That is what the props show at that instant - move k's end position - and
 * it is why the landing that closes a pass still belongs to that pass rather
 * than wrapping to move 1 of the next.
 *
 * Once the performer makes their last landing the frame is holding: the pose
 * stays, and nothing that anticipates a next move (a carousel sliding on) may
 * run, because there is none.
 */
export type SequencePhase = "opening" | "moving" | "holding";

export interface SequenceFrame {
  /** The arrival position it was built from, never below 0. */
  arrival: number;
  phase: SequencePhase;
  /** Moves counted across passes: 1 is the first move ever. 0 opening. */
  absoluteMove: number;
  /** 1..N, the move in flight or just landed. 0 for the opening pose. */
  move: number;
  /** How far through `move`, in (0, 1]. 0 for the opening pose. */
  moveProgress: number;
  /** Zero-based repetition `move` belongs to. */
  pass: number;
  /** Position within the pass on the same count, 0..N. */
  passArrival: number;
  /** Share of the pass's beats elapsed, 0..1, for a progress bar. */
  passBeatProgress: number;
  /**
   * Beats since the opening pose, across passes. Anything that animates with
   * the performer - trails, a traced path - reads this, never a wall clock.
   */
  beatsElapsed: number;
  /**
   * The animation engine's count: [1, 2) is move 1 in flight, and N + 1 is
   * the last move landed. The opening pose is 1, move 1 about to begin.
   */
  enginePosition: number;
}

export interface SequenceFrameOptions {
  /**
   * Step playback: hold each landed pose until the next landing instead of
   * showing the move in between.
   */
  holdLandings?: boolean;
  /**
   * The performer's last landing. At or past it the frame holds that pose.
   * Null or absent when the take runs on.
   */
  endArrival?: number | null;
}

export function sequenceFrameAt(
  arrivalPosition: number,
  moveBeats: readonly number[],
  options: SequenceFrameOptions = {}
): SequenceFrame {
  const clock = createBeatClock(moveBeats);
  const movesPerPass = clock.movesPerPass;
  const endArrival =
    typeof options.endArrival === "number" &&
    Number.isFinite(options.endArrival)
      ? Math.max(0, options.endArrival)
      : null;
  let raw = Number.isFinite(arrivalPosition)
    ? Math.max(0, arrivalPosition)
    : 0;
  const holding = endArrival !== null && raw >= endArrival - 1e-9;
  if (holding) raw = endArrival;
  const arrival = options.holdLandings ? Math.floor(raw + 1e-9) : raw;

  if (arrival <= 0) {
    return {
      arrival: 0,
      phase: "opening",
      absoluteMove: 0,
      move: 0,
      moveProgress: 0,
      pass: 0,
      passArrival: 0,
      passBeatProgress: 0,
      beatsElapsed: 0,
      enginePosition: 1,
    };
  }

  // Snap float dust at a landing onto the landing itself, so 7.9999999999
  // from interpolation is move 8 finished, not move 8 a hair short.
  const nearestLanding = Math.round(arrival);
  const settled =
    Math.abs(arrival - nearestLanding) < 1e-9 ? nearestLanding : arrival;
  const absoluteMove = Math.ceil(settled);
  const pass = Math.floor((absoluteMove - 1) / movesPerPass);
  const move = absoluteMove - pass * movesPerPass;
  const moveProgress = settled - (absoluteMove - 1);
  const passBeats =
    clock.beatsBefore(move - 1) + moveProgress * clock.moveBeatsAt(move);

  return {
    arrival: settled,
    phase: holding ? "holding" : "moving",
    absoluteMove,
    move,
    moveProgress,
    pass,
    passArrival: move - 1 + moveProgress,
    passBeatProgress: passBeats / clock.beatsPerPass,
    beatsElapsed: pass * clock.beatsPerPass + passBeats,
    enginePosition: move + moveProgress,
  };
}
