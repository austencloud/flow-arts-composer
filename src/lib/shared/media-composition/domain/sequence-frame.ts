import type {
  SequenceFrame,
  SequencePhase,
} from "@austencloud/video-editor/core";
import { createBeatClock } from "#lib/shared/media-composition/domain/tap-fit.js";

export type { SequenceFrame, SequencePhase };

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
  let raw = Number.isFinite(arrivalPosition) ? Math.max(0, arrivalPosition) : 0;
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

/**
 * How much of the showing move's arrow is drawn. It fades in as the move is
 * made, the way the Construct audition shows it, and is whole once the move
 * lands and while the performer holds the last pose.
 */
export function arrowOpacity(
  frame: Pick<SequenceFrame, "phase" | "moveProgress">
): number {
  if (frame.phase === "opening") return 0;
  if (frame.phase === "holding") return 1;
  return Math.min(1, Math.max(0, frame.moveProgress));
}

// A short portion of the next move lets the completed arrow disappear in place.
// Move progress keeps this fade aligned when a take is slowed or scrubbed.
const ARROW_HANDOFF_PROGRESS = 0.05;

export function sequenceArrowLayers(
  frame: Pick<SequenceFrame, "phase" | "move" | "moveProgress" | "pass">,
  movesPerPass: number
): {
  currentOpacity: number;
  previousMove: number | null;
  previousOpacity: number;
} {
  const currentOpacity = arrowOpacity(frame);
  const previousMove =
    frame.phase === "opening" || movesPerPass < 1
      ? null
      : frame.move > 1
        ? frame.move - 1
        : frame.pass > 0
          ? movesPerPass
          : null;
  const previousOpacity =
    previousMove === null || frame.phase === "holding"
      ? 0
      : Math.max(0, 1 - currentOpacity / ARROW_HANDOFF_PROGRESS);
  return { currentOpacity, previousMove, previousOpacity };
}
