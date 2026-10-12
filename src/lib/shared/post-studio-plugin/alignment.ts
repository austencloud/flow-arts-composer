import type {
  AlignmentProvider,
  EvaluatedFrameLayer,
  FrameAlignment,
  TakeClock,
} from "@austencloud/video-editor/render";
import {
  takeRole,
  type PipHandoffStep,
  type SequenceTimeMap,
  type TakeSample,
} from "@austencloud/video-editor/core";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import {
  sequencePositionToAnimationTime,
  wrapSequencePosition,
} from "#lib/shared/animation-engine/services/step-calculator.js";
import { sequenceFrameAt } from "#lib/shared/media-composition/domain/sequence-frame.js";
import {
  resolveTakeTiming,
  takeSampleAt,
  type TakeTiming,
} from "#lib/shared/media-composition/domain/take-timing.js";

// This module and everything it reaches must never import the plugin index by
// value: bound imports it, and the index re-exports bound.
// tests/unit/video-editor-value-closure.test.ts guards it.

/**
 * tka's half of the frame evaluator's alignment: the sequence engine's steps
 * and take clocks, which the package knows nothing about. `tkaFrameAlignment`
 * turns today's `SequenceFrameAlignment` into the package's `FrameAlignment`,
 * so every caller keeps passing the object it builds now.
 */
export interface SequenceFrameAlignment {
  steps: readonly StepData[];
  startPlacementDuration: number;
  /** Passes needed for this LOOP to return to its opening pose. */
  sequencePeriod?: number;
  /**
   * Clocks by take role. A clip whose `timeMapRole` names one reads its move
   * from that take's media time at the clip's own source time.
   */
  clocks?: Readonly<Record<string, TakeClock>>;
  /**
   * One map for the whole post, read at post time: the older single-take
   * path, used by clips that name no clock.
   */
  timeMap?: SequenceTimeMap;
  /**
   * Where project time zero sits in `timeMap`'s media. A step map is recorded
   * against the footage as shot, so trimming the head off a take moves the post
   * clock away from the map's clock by exactly the amount trimmed. Adding it
   * back here keeps the card on the step the performer is actually landing.
   */
  mediaTimeOffsetSeconds?: number;
  /** Told why each hand-off side drew what it did; for tracing only. */
  explainHandoff?: (
    step: PipHandoffStep & { role: "from" | "to"; postSeconds: number }
  ) => void;
}

/**
 * The sequence fields a mapped layer carries, all from one frame record so
 * the square, the strip, the carousel and the beat number show one move.
 */
function sequenceFieldsFor(
  sample: TakeSample,
  alignment: SequenceFrameAlignment,
  moveBeats: readonly number[],
  holdLandings: boolean
): Pick<
  EvaluatedFrameLayer,
  | "sequenceFrame"
  | "sequencePosition"
  | "sequencePassIndex"
  | "carouselPosition"
  | "animationTimeSeconds"
  | "displayedBeatNumber"
> {
  const frame = sequenceFrameAt(sample.arrival, moveBeats, {
    holdLandings,
    endArrival: sample.endArrival,
  });
  return {
    sequenceFrame: frame,
    sequencePosition: frame.enginePosition,
    sequencePassIndex: frame.pass,
    carouselPosition: wrapSequencePosition(frame.arrival, moveBeats.length),
    animationTimeSeconds: sequencePositionToAnimationTime(
      frame.enginePosition,
      alignment.steps,
      alignment.startPlacementDuration
    ),
    displayedBeatNumber: frame.move,
  };
}

/** The package's alignment for a tka sequence: its steps, clocks and map. */
export function tkaFrameAlignment(
  input: SequenceFrameAlignment
): FrameAlignment {
  return {
    moveBeats: input.steps.map((step) => step.duration ?? 1),
    sequencePeriod: input.sequencePeriod,
    clocks: input.clocks,
    timeMap: input.timeMap,
    mediaTimeOffsetSeconds: input.mediaTimeOffsetSeconds,
    explainHandoff: input.explainHandoff,
    frameFields: (sample, moveBeats, holdLandings) =>
      sequenceFieldsFor(sample, input, moveBeats, holdLandings),
  };
}

/**
 * The provider that builds what the editor builds today: the sequence's steps
 * and period, and one clock per take that has timing. The project is not read;
 * the sequence and the timings come from the editor's state through the two
 * getters. Nothing calls it in step 1.
 */
export function createTkaAlignment(
  getSequence: () => SequenceData,
  getTimings: () => Record<string, TakeTiming> = () => ({})
): AlignmentProvider {
  return {
    create: (_project) => {
      const sequence = getSequence();
      const moveBeats = sequence.steps.map((step) => step.duration ?? 1);
      const clocks: Record<string, TakeClock> = {};
      for (const [takeId, timing] of Object.entries(getTimings())) {
        const resolved = resolveTakeTiming(timing, moveBeats);
        clocks[takeRole(takeId)] = {
          sampleAt: (mediaSeconds, options) =>
            takeSampleAt(resolved, mediaSeconds, options),
        };
      }
      return tkaFrameAlignment({
        steps: sequence.steps,
        startPlacementDuration: 1,
        sequencePeriod: sequence.period ?? sequence.orientationCycleCount ?? 1,
        clocks,
      });
    },
  };
}
