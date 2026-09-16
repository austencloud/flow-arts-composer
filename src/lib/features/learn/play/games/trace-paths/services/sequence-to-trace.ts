/**
 * SequenceData → TraceRound.
 *
 * Turns a real sequence into the ordered, directed routes the player draws.
 * One beat per step, in order, and the hand's own start/end locations decide
 * everything — the converter never consults pointer order, color alone, or any
 * runtime state. Hand assignment at play time comes from the zone the pointer
 * touches; here it comes from which motion slot the data lives in.
 *
 * The converter refuses rather than repairs. A sequence whose beats don't chain
 * (a hand teleports between steps) or that drops a hand mid-round is not
 * traceable, and the game shows that as an earned error with a retry.
 */

import {
  GridLocation,
  GridMode,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { isVisibleMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { buildTraceSegment } from "./hand-path-to-trace";
import { TRACE_HANDS } from "../domain/trace-types";
import type {
  HandTrace,
  TraceBeat,
  TraceConversionResult,
  TraceHand,
  TraceRound,
  TraceSegment,
} from "../domain/trace-types";

/**
 * Which grid the round is drawn on.
 *
 * Fallback chain, most authoritative first:
 *   1. `sequence.gridMode` — set by the hydrator on anything that came from the
 *      library, and the only field that describes the sequence as a whole.
 *   2. The first step's own `gridMode` — present on steps built by the step
 *      editor, absent on plenty of older data.
 *   3. The first step's left motion `gridMode` — required on every MotionData,
 *      so this is the last field that can actually carry the answer.
 *   4. DIAMOND — the app's default grid. Reached only when a caller hands us a
 *      sequence assembled by hand with no grid information anywhere in it.
 *
 * Note we never *infer* the mode from which locations appear. That inference
 * exists (hand-path-factory's deriveGridMode) but it guesses skewed/box from
 * cardinality, and guessing the stage the player draws on is worse than
 * defaulting to the one they see everywhere else.
 */
function resolveGridMode(
  sequence: SequenceData,
  firstStep: StepData
): GridMode {
  return (
    sequence.gridMode ??
    firstStep.gridMode ??
    firstStep.motions.left.gridMode ??
    GridMode.DIAMOND
  );
}

/**
 * Where this hand begins, using the same priority order the sequence
 * decomposer uses (`shared/foundation/services/sequence-decomposer.ts`):
 * startPlacement, then its legacy alias startingPlacement, then the first step's
 * own motion.
 *
 * Unlike the decomposer we do NOT fall back to a hard NORTH default. The
 * decomposer needs a value to keep content hashes stable on corrupt data; this
 * converter would be putting a player's finger on a point the choreography
 * never named, so absence here is a caller error we surface instead.
 */
function resolveStartLocation(
  sequence: SequenceData,
  firstMotion: MotionData,
  hand: TraceHand
): GridLocation {
  const startPlacementMotions =
    sequence.startPlacement?.motions ?? sequence.startingPlacement?.motions;

  return (
    startPlacementMotions?.[hand]?.startLocation ?? firstMotion.startLocation
  );
}

/** A hand is in the round if it is really there — visible, not a placeholder — on any step. */
function handParticipates(
  steps: readonly StepData[],
  hand: TraceHand
): boolean {
  return steps.some((step) => isVisibleMotion(step.motions[hand]));
}

export function sequenceToTraceRound(
  sequence: SequenceData
): TraceConversionResult {
  const steps = sequence.steps;
  const firstStep = steps[0];

  if (!firstStep) {
    return {
      ok: false,
      error: {
        code: "empty-round",
        message: "This sequence has no steps, so there's nothing to trace.",
      },
    };
  }

  const hands = TRACE_HANDS.filter((hand) => handParticipates(steps, hand));

  if (hands.length === 0) {
    return {
      ok: false,
      error: {
        code: "empty-round",
        message:
          "Neither hand is present in this sequence, so there's nothing to trace.",
      },
    };
  }

  // Cursor per hand: where that hand currently is. Seeded from the round's
  // start, then advanced one beat at a time. Every beat must begin exactly
  // where the cursor sits — that check IS the continuity guarantee.
  const cursor = new Map<TraceHand, GridLocation>();
  const segmentsByHand = new Map<TraceHand, TraceSegment[]>();

  for (const hand of hands) {
    const firstMotion = firstStep.motions[hand];
    if (!isVisibleMotion(firstMotion)) {
      // The hand shows up later in the round but is missing on beat 0, so
      // there is no honest place to put the player's finger at the start.
      return {
        ok: false,
        error: {
          code: "missing-hand-motion",
          message: `The ${hand} hand is missing on beat 1, so this round can't start.`,
          hand,
          beatIndex: 0,
        },
      };
    }
    cursor.set(hand, resolveStartLocation(sequence, firstMotion, hand));
    segmentsByHand.set(hand, []);
  }

  const starts = new Map<TraceHand, GridLocation>(cursor);
  const beats: TraceBeat[] = [];

  for (let beatIndex = 0; beatIndex < steps.length; beatIndex++) {
    const step = steps[beatIndex] as StepData;
    const beatSegments: Partial<Record<TraceHand, TraceSegment>> = {};

    for (const hand of hands) {
      const motion = step.motions[hand];

      // A hand that participates in the round must be present on every beat of
      // it. Skipping the beat would silently splice two non-adjacent locations
      // into one segment and hand the player a route the sequence never had.
      if (!isVisibleMotion(motion)) {
        return {
          ok: false,
          error: {
            code: "missing-hand-motion",
            message: `The ${hand} hand is missing on beat ${beatIndex + 1}, so this sequence can't be traced.`,
            hand,
            beatIndex,
          },
        };
      }

      const from = cursor.get(hand) as GridLocation;

      if (motion.startLocation !== from) {
        return {
          ok: false,
          error: {
            code: "discontinuous-beat",
            message:
              `The ${hand} hand jumps from ${from} to ${motion.startLocation} at beat ` +
              `${beatIndex + 1} without a path between them, so this sequence can't be traced.`,
            hand,
            beatIndex,
          },
        };
      }

      const segment = buildTraceSegment(from, motion.endLocation);
      beatSegments[hand] = segment;
      (segmentsByHand.get(hand) as TraceSegment[]).push(segment);
      cursor.set(hand, motion.endLocation);
    }

    beats.push({ index: beatIndex, segments: beatSegments });
  }

  const handTraces: Partial<Record<TraceHand, HandTrace>> = {};
  for (const hand of hands) {
    handTraces[hand] = {
      hand,
      start: starts.get(hand) as GridLocation,
      segments: segmentsByHand.get(hand) as TraceSegment[],
    };
  }

  const round: TraceRound = {
    id: `trace:sequence:${sequence.id}`,
    gridMode: resolveGridMode(sequence, firstStep),
    hands: handTraces,
    beats,
  };

  return { ok: true, round };
}
