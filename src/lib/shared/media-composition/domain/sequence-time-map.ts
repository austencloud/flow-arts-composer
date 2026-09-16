import { z } from "zod";
import type { StepMap } from "$lib/shared/video-collaboration/domain/collaborative-video";

const NonEmptyIdSchema = z.string().trim().min(1);

export const SequenceRevisionRefSchema = z
  .object({
    sequenceId: NonEmptyIdSchema,
    ownerId: NonEmptyIdSchema.optional(),
    revisionId: NonEmptyIdSchema.optional(),
    contentHash: NonEmptyIdSchema.optional(),
  })
  .strict()
  .refine((reference) => reference.revisionId || reference.contentHash, {
    message: "A sequence reference needs a revisionId or contentHash",
  });

export type SequenceRevisionRef = z.infer<typeof SequenceRevisionRefSchema>;

export const SequenceTimeAnchorSchema = z
  .object({
    mediaTimeSeconds: z.number().finite().nonnegative(),
    sequencePosition: z.number().finite().nonnegative(),
    confidence: z.number().finite().min(0).max(1).optional(),
  })
  .strict();

export type SequenceTimeAnchor = z.infer<typeof SequenceTimeAnchorSchema>;

export const SequenceTimeMapSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: NonEmptyIdSchema,
    sequenceRef: SequenceRevisionRefSchema,
    mediaSourceId: NonEmptyIdSchema,
    anchors: z.array(SequenceTimeAnchorSchema).min(2),
    source: z.enum([
      "manual",
      "tempo-grid",
      "audio-detected",
      "motion-detected",
      "hybrid",
    ]),
    boundaryPolicy: z.literal("clamp"),
    confidence: z.number().finite().min(0).max(1).optional(),
    updatedAt: z.number().finite().int().nonnegative(),
  })
  .strict()
  .superRefine((timeMap, context) => {
    for (let index = 1; index < timeMap.anchors.length; index += 1) {
      const previous = timeMap.anchors[index - 1]!;
      const current = timeMap.anchors[index]!;

      if (current.mediaTimeSeconds <= previous.mediaTimeSeconds) {
        context.addIssue({
          code: "custom",
          path: ["anchors", index, "mediaTimeSeconds"],
          message: "Media times must be strictly increasing",
        });
      }

      if (current.sequencePosition <= previous.sequencePosition) {
        context.addIssue({
          code: "custom",
          path: ["anchors", index, "sequencePosition"],
          message: "Sequence positions must be strictly increasing",
        });
      }
    }
  });

export type SequenceTimeMap = z.infer<typeof SequenceTimeMapSchema>;

type AnchorAxis = (anchor: SequenceTimeAnchor) => number;

function interpolateAnchors(
  anchors: readonly SequenceTimeAnchor[],
  value: number,
  inputAxis: AnchorAxis,
  outputAxis: AnchorAxis
): number {
  if (!Number.isFinite(value)) {
    throw new RangeError("Time-map input must be finite");
  }

  const first = anchors[0]!;
  const last = anchors[anchors.length - 1]!;

  if (value <= inputAxis(first)) return outputAxis(first);
  if (value >= inputAxis(last)) return outputAxis(last);

  let low = 0;
  let high = anchors.length - 1;

  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (inputAxis(anchors[middle]!) <= value) {
      low = middle;
    } else {
      high = middle;
    }
  }

  const start = anchors[low]!;
  const end = anchors[high]!;
  const inputStart = inputAxis(start);
  const progress = (value - inputStart) / (inputAxis(end) - inputStart);

  return outputAxis(start) + progress * (outputAxis(end) - outputAxis(start));
}

export function mediaTimeToSequencePosition(
  timeMap: SequenceTimeMap,
  mediaTimeSeconds: number
): number {
  return interpolateAnchors(
    timeMap.anchors,
    mediaTimeSeconds,
    (anchor) => anchor.mediaTimeSeconds,
    (anchor) => anchor.sequencePosition
  );
}

export function sequencePositionToMediaTime(
  timeMap: SequenceTimeMap,
  sequencePosition: number
): number {
  return interpolateAnchors(
    timeMap.anchors,
    sequencePosition,
    (anchor) => anchor.sequencePosition,
    (anchor) => anchor.mediaTimeSeconds
  );
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) return sorted[middle]!;
  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function legacyStepMapSource(
  source: StepMap["source"]
): SequenceTimeMap["source"] {
  if (source === "auto-detected") return "audio-detected";
  return source;
}

export interface LegacyStepMapMigrationInput {
  stepMap: StepMap;
  sequenceRef: SequenceRevisionRef;
  mediaSourceId: string;
  mediaDurationSeconds: number;
  id?: string;
}

export interface TempoGridTimeMapInput {
  sequenceRef: SequenceRevisionRef;
  mediaSourceId: string;
  mediaDurationSeconds: number;
  motionDurations: readonly number[];
  startPlacementDuration?: number;
  id?: string;
  updatedAt?: number;
}

/**
 * Build the editable baseline used before the user or an analyzer has marked
 * real beats. Motion-duration weights are preserved, then scaled to the media
 * duration. Its low confidence is deliberate: callers can offer useful synced
 * controls without presenting an inferred grid as measured truth.
 */
export function createTempoGridTimeMap(
  input: TempoGridTimeMapInput
): SequenceTimeMap {
  const {
    sequenceRef,
    mediaSourceId,
    mediaDurationSeconds,
    motionDurations,
    startPlacementDuration = 1,
    id = `${mediaSourceId}:tempo-grid:v1`,
    updatedAt = Date.now(),
  } = input;

  if (!Number.isFinite(mediaDurationSeconds) || mediaDurationSeconds <= 0) {
    throw new RangeError("Media duration must be a positive finite number");
  }
  if (!Number.isFinite(startPlacementDuration) || startPlacementDuration <= 0) {
    throw new RangeError(
      "Start-position duration must be a positive finite number"
    );
  }
  if (motionDurations.length === 0) {
    throw new RangeError("A tempo grid needs at least one motion duration");
  }
  if (
    motionDurations.some(
      (duration) => !Number.isFinite(duration) || duration <= 0
    )
  ) {
    throw new RangeError("Motion durations must be positive finite numbers");
  }

  const totalUnits =
    startPlacementDuration +
    motionDurations.reduce((total, duration) => total + duration, 0);
  const anchors: SequenceTimeAnchor[] = [
    { mediaTimeSeconds: 0, sequencePosition: 0 },
  ];
  let elapsedUnits = startPlacementDuration;
  anchors.push({
    mediaTimeSeconds: (elapsedUnits / totalUnits) * mediaDurationSeconds,
    sequencePosition: 1,
  });

  motionDurations.forEach((duration, index) => {
    elapsedUnits += duration;
    anchors.push({
      mediaTimeSeconds: (elapsedUnits / totalUnits) * mediaDurationSeconds,
      sequencePosition: index + 2,
    });
  });

  return SequenceTimeMapSchema.parse({
    schemaVersion: 1,
    id,
    sequenceRef,
    mediaSourceId,
    anchors,
    source: "tempo-grid",
    boundaryPolicy: "clamp",
    confidence: 0.25,
    updatedAt,
  });
}

/**
 * Turns the old one-timestamp-per-beat record into a complete fractional map.
 *
 * Every timestamp is an ARRIVAL the performer tapped. Mark 0 is the opening
 * pose, which is position zero, and mark k is the landing of move k - so the
 * shape held between two marks is the earlier one, the shape that was on
 * screen when the tap happened. Anchoring on the launch instead would run the
 * card one move ahead of the footage and leave position zero unreachable.
 *
 * A take may run the sequence through more than once, so the marks are any
 * whole number of passes worth. Positions keep counting past the sequence's
 * length - pass 2's first move is position `stepCount + 1` - because the schema
 * requires them to increase and the interpolator binary-searches on them.
 * Folding a multi-pass take back into one cycle is the frame evaluator's job,
 * on the far side of the interpolation.
 */
export function migrateLegacyStepMap(
  input: LegacyStepMapMigrationInput
): SequenceTimeMap {
  const {
    stepMap,
    sequenceRef,
    mediaSourceId,
    mediaDurationSeconds,
    id = `${mediaSourceId}:sequence-time-map:v1`,
  } = input;

  if (!Number.isFinite(mediaDurationSeconds) || mediaDurationSeconds <= 0) {
    throw new RangeError("Media duration must be a positive finite number");
  }

  if (stepMap.stepCount <= 0 || !Number.isInteger(stepMap.stepCount)) {
    throw new RangeError("Legacy stepCount must be a positive integer");
  }

  if (
    stepMap.beatTimestamps.length === 0 ||
    stepMap.beatTimestamps.length % stepMap.stepCount !== 0
  ) {
    throw new RangeError(
      "A legacy StepMap must contain a whole number of passes over the sequence"
    );
  }

  const timestamps = [...stepMap.beatTimestamps];
  for (let index = 0; index < timestamps.length; index += 1) {
    const timestamp = timestamps[index]!;
    const previous = timestamps[index - 1];

    if (!Number.isFinite(timestamp) || timestamp < 0) {
      throw new RangeError(
        "Legacy beat timestamps must be finite and nonnegative"
      );
    }

    if (previous !== undefined && timestamp <= previous) {
      throw new RangeError(
        "Legacy beat timestamps must be strictly increasing"
      );
    }
  }

  const lastTimestamp = timestamps[timestamps.length - 1]!;
  if (lastTimestamp >= mediaDurationSeconds) {
    throw new RangeError("The final beat must begin before the media ends");
  }

  // Mark 0 is the opening pose - position zero, no move behind it - and mark k
  // is the landing of move k. Anchoring on the landing is what keeps the card
  // showing the shape the performer tapped instead of the one they are
  // travelling towards.
  const anchors: SequenceTimeAnchor[] = timestamps.map(
    (mediaTimeSeconds, index) => ({ mediaTimeSeconds, sequencePosition: index })
  );

  const intervals = timestamps
    .slice(1)
    .map((timestamp, index) => timestamp - timestamps[index]!);
  const inferredFinalDuration =
    median(intervals) ?? mediaDurationSeconds - lastTimestamp;
  // The end mark is a real arrival the performer tapped, so it beats an
  // inference from the median interval. Maps saved before the editor collected
  // one, and any value that would not advance the anchor, fall back to it.
  const markedEnd = stepMap.endTimestamp;
  const finalBeatEnd = Math.min(
    mediaDurationSeconds,
    markedEnd !== undefined &&
      Number.isFinite(markedEnd) &&
      markedEnd > lastTimestamp
      ? markedEnd
      : lastTimestamp + inferredFinalDuration
  );

  anchors.push({
    mediaTimeSeconds: finalBeatEnd,
    sequencePosition: timestamps.length,
  });

  return SequenceTimeMapSchema.parse({
    schemaVersion: 1,
    id,
    sequenceRef,
    mediaSourceId,
    anchors,
    source: legacyStepMapSource(stepMap.source),
    boundaryPolicy: "clamp",
    updatedAt: stepMap.updatedAt.getTime(),
  });
}
