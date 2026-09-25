import { z } from "zod";
import {
  PLAYBACK_MAX_BPM,
  PLAYBACK_MIN_BPM,
} from "$lib/shared/animation-engine/domain/constants/timing";
import {
  SequenceTimeMapSchema,
  mediaTimeToSequencePosition,
  type SequenceTimeAnchor,
  type SequenceTimeMap,
} from "$lib/shared/media-composition/domain/sequence-time-map";
import {
  createBeatClock,
  fitTapsToGrid,
  type TapFitResult,
} from "$lib/shared/media-composition/domain/tap-fit";

/**
 * How one take lines up with the sequence: Austen's typed tempo and rough
 * taps, fitted once into landings that every layer then reads.
 *
 * A raw take has one section. An already-edited video (an InShot export that
 * runs full speed and then slow) gets one section per tempo, each fitted on
 * its own, so the strip can follow a slow part without a second file.
 *
 * Only what Austen chose is stored - taps, tempo, nudges. The grid is
 * recomputed from them, so a better fitter improves every saved take.
 */

const IdSchema = z.string().trim().min(1);
const MediaSecondsSchema = z.number().finite().nonnegative();

export const TimingOverrideSchema = z
  .object({
    /** Arrival position: 0 is the opening pose, p the landing of move p. */
    position: z.number().int().nonnegative(),
    /** Where Austen dragged that landing, media seconds. */
    seconds: MediaSecondsSchema,
  })
  .strict();

export type TimingOverride = z.infer<typeof TimingOverrideSchema>;

export const TimingSectionSchema = z
  .object({
    id: IdSchema,
    startSeconds: MediaSecondsSchema,
    endSeconds: MediaSecondsSchema,
    bpm: z.number().finite().min(PLAYBACK_MIN_BPM).max(PLAYBACK_MAX_BPM),
    /** "locked" holds the typed BPM; "follow" fits the video's own within ±5%. */
    tempo: z.enum(["locked", "follow"]),
    /** "grid": even landings. "taps": each matched tap is its landing. */
    snap: z.enum(["grid", "taps"]),
    taps: z.array(MediaSecondsSchema),
    /** The position the earliest matched tap marks. 1 is move 1's landing. */
    firstTapPosition: z.number().int().nonnegative(),
    /** Whole-grid nudge, seconds; the UI moves it a frame at a time. */
    offsetSeconds: z.number().finite(),
    overrides: z.array(TimingOverrideSchema),
  })
  .strict()
  .refine((section) => section.endSeconds > section.startSeconds, {
    message: "A timing section must end after it starts",
    path: ["endSeconds"],
  });

export type TimingSection = z.infer<typeof TimingSectionSchema>;

export const TakeTimingSchema = z
  .object({
    schemaVersion: z.literal(1),
    sequenceId: IdSchema,
    takeKey: IdSchema,
    sections: z.array(TimingSectionSchema).min(1),
    updatedAt: z.number().finite().int().nonnegative(),
  })
  .strict()
  .superRefine((timing, context) => {
    timing.sections.forEach((section, index) => {
      const previous = timing.sections[index - 1];
      if (previous && section.startSeconds < previous.endSeconds - 1e-6) {
        context.addIssue({
          code: "custom",
          path: ["sections", index, "startSeconds"],
          message: "Timing sections must be in order and must not overlap",
        });
      }
    });
  });

export type TakeTiming = z.infer<typeof TakeTimingSchema>;

export const DEFAULT_TAKE_BPM = 87;

/** A fresh, unmapped section covering a whole take. */
export function createTimingSection(input: {
  id: string;
  startSeconds: number;
  endSeconds: number;
  bpm?: number;
}): TimingSection {
  return {
    id: input.id,
    startSeconds: input.startSeconds,
    endSeconds: input.endSeconds,
    bpm: input.bpm ?? DEFAULT_TAKE_BPM,
    tempo: "follow",
    snap: "grid",
    taps: [],
    firstTapPosition: 1,
    offsetSeconds: 0,
    overrides: [],
  };
}

export function createTakeTiming(input: {
  sequenceId: string;
  takeKey: string;
  durationSeconds: number;
  bpm?: number;
  now: number;
}): TakeTiming {
  return {
    schemaVersion: 1,
    sequenceId: input.sequenceId,
    takeKey: input.takeKey,
    sections: [
      createTimingSection({
        id: "section-1",
        startSeconds: 0,
        endSeconds: input.durationSeconds,
        bpm: input.bpm,
      }),
    ],
    updatedAt: input.now,
  };
}

/**
 * Splits the section that contains `atSeconds` in two. The new right-hand
 * section starts unmapped with the same BPM; taps and overrides stay with the
 * side they fall on.
 */
export function splitTimingSection(
  timing: TakeTiming,
  atSeconds: number,
  newId: string,
  now: number
): TakeTiming {
  const index = timing.sections.findIndex(
    (section) =>
      atSeconds > section.startSeconds + 0.25 &&
      atSeconds < section.endSeconds - 0.25
  );
  if (index < 0) return timing;
  const section = timing.sections[index]!;
  const left: TimingSection = {
    ...section,
    endSeconds: atSeconds,
    taps: section.taps.filter((tap) => tap < atSeconds),
    overrides: section.overrides.filter(
      (override) => override.seconds < atSeconds
    ),
  };
  const right: TimingSection = {
    ...createTimingSection({
      id: newId,
      startSeconds: atSeconds,
      endSeconds: section.endSeconds,
      bpm: section.bpm,
    }),
    taps: section.taps.filter((tap) => tap >= atSeconds),
    overrides: section.overrides.filter(
      (override) => override.seconds >= atSeconds
    ),
  };
  const sections = [...timing.sections];
  sections.splice(index, 1, left, right);
  return { ...timing, sections, updatedAt: now };
}

/** Joins a section into the one before it, keeping the earlier one's tempo. */
export function mergeTimingSectionIntoPrevious(
  timing: TakeTiming,
  sectionId: string,
  now: number
): TakeTiming {
  const index = timing.sections.findIndex(
    (section) => section.id === sectionId
  );
  if (index <= 0) return timing;
  const previous = timing.sections[index - 1]!;
  const section = timing.sections[index]!;
  const merged: TimingSection = {
    ...previous,
    endSeconds: section.endSeconds,
    taps: [...previous.taps, ...section.taps],
    overrides: [...previous.overrides, ...section.overrides],
  };
  const sections = [...timing.sections];
  sections.splice(index - 1, 2, merged);
  return { ...timing, sections, updatedAt: now };
}

export interface ResolvedTimingSection {
  id: string;
  startSeconds: number;
  endSeconds: number;
  /** Arrival map covering the section; null until it has a tap. */
  map: SequenceTimeMap | null;
  fit: TapFitResult | null;
  /** Landing times by position, for drawing the grid. */
  landings: { position: number; seconds: number }[];
}

export interface ResolvedTakeTiming {
  takeKey: string;
  movesPerPass: number;
  sections: ResolvedTimingSection[];
}

/** Keeps landings strictly increasing after overrides and interpolation. */
function enforceIncreasing(
  landings: { position: number; seconds: number }[]
): void {
  const minimumGap = 0.001;
  for (let index = 1; index < landings.length; index += 1) {
    const previous = landings[index - 1]!;
    const current = landings[index]!;
    if (current.seconds <= previous.seconds + minimumGap) {
      current.seconds = previous.seconds + minimumGap;
    }
  }
}

function resolveSection(
  section: TimingSection,
  moveBeats: readonly number[],
  context: { sequenceId: string; takeKey: string; updatedAt: number }
): ResolvedTimingSection {
  const empty: ResolvedTimingSection = {
    id: section.id,
    startSeconds: section.startSeconds,
    endSeconds: section.endSeconds,
    map: null,
    fit: null,
    landings: [],
  };
  const taps = section.taps.filter(
    (tap) => tap >= section.startSeconds && tap <= section.endSeconds
  );
  if (taps.length === 0) return empty;

  const clock = createBeatClock(moveBeats);
  const fit = fitTapsToGrid({
    taps,
    bpm: section.bpm,
    moveBeats,
    firstTapPosition: section.firstTapPosition,
    tempo: section.tempo,
  });
  const spb = fit.secondsPerBeat;
  const gridAt = (position: number) =>
    fit.originSeconds + spb * clock.beatsBefore(position) + section.offsetSeconds;

  // Every position whose landing could matter to this section: from the last
  // landing at or before its start (never below the opening pose) to the
  // first landing at or after its end, so the map spans the section.
  const firstPosition = Math.max(
    0,
    clock.nearestPosition((section.startSeconds - fit.originSeconds) / spb) - 1
  );
  let lastPosition = firstPosition + 1;
  while (gridAt(lastPosition) < section.endSeconds) lastPosition += 1;

  const tapped = new Map<number, number>();
  if (section.snap === "taps") {
    for (const label of fit.labels) {
      if (label.position !== null) {
        tapped.set(label.position, label.seconds + section.offsetSeconds);
      }
    }
  }
  const tappedPositions = [...tapped.keys()].sort((left, right) => left - right);
  const snappedAt = (position: number): number => {
    if (tappedPositions.length === 0) return gridAt(position);
    const exact = tapped.get(position);
    if (exact !== undefined) return exact;
    const beats = clock.beatsBefore(position);
    const after = tappedPositions.find((candidate) => candidate > position);
    const before = [...tappedPositions]
      .reverse()
      .find((candidate) => candidate < position);
    // Inside the tapped run, a missed landing sits between its tapped
    // neighbours in proportion to beats; outside it, the grid continues from
    // the nearest tap so the ends do not jump.
    if (before !== undefined && after !== undefined) {
      const fromBeats = clock.beatsBefore(before);
      const toBeats = clock.beatsBefore(after);
      const share = (beats - fromBeats) / (toBeats - fromBeats);
      return tapped.get(before)! + (tapped.get(after)! - tapped.get(before)!) * share;
    }
    const nearest = (before ?? after)!;
    return tapped.get(nearest)! + spb * (beats - clock.beatsBefore(nearest));
  };

  const overrides = new Map(
    section.overrides.map((override) => [override.position, override.seconds])
  );
  const landings: { position: number; seconds: number }[] = [];
  for (let position = firstPosition; position <= lastPosition; position += 1) {
    landings.push({
      position,
      seconds: overrides.get(position) ?? snappedAt(position),
    });
  }
  enforceIncreasing(landings);

  // The schema needs nonnegative media times; a grid reaching back before the
  // file's first frame is cut at zero with the position it would have there.
  let anchors: SequenceTimeAnchor[] = landings.map((landing) => ({
    mediaTimeSeconds: landing.seconds,
    sequencePosition: landing.position,
  }));
  const firstNonNegative = anchors.findIndex(
    (anchor) => anchor.mediaTimeSeconds >= 0
  );
  if (firstNonNegative > 0) {
    const before = anchors[firstNonNegative - 1]!;
    const after = anchors[firstNonNegative]!;
    const share =
      (0 - before.mediaTimeSeconds) /
      (after.mediaTimeSeconds - before.mediaTimeSeconds);
    const zero = {
      mediaTimeSeconds: 0,
      sequencePosition:
        before.sequencePosition +
        (after.sequencePosition - before.sequencePosition) * share,
    };
    anchors = [
      ...(after.mediaTimeSeconds > 0 ? [zero] : []),
      ...anchors.slice(firstNonNegative),
    ];
  } else if (firstNonNegative < 0) {
    return { ...empty, fit };
  }
  if (anchors.length < 2) return { ...empty, fit };

  const map = SequenceTimeMapSchema.parse({
    schemaVersion: 1,
    id: `${context.takeKey}:${section.id}`,
    sequenceRef: {
      sequenceId: context.sequenceId,
      contentHash: `beats:${moveBeats.join(",")}`,
    },
    mediaSourceId: context.takeKey,
    anchors,
    source: "manual",
    boundaryPolicy: "clamp",
    updatedAt: context.updatedAt,
    positionConvention: "arrival",
  });

  return { ...empty, map, fit, landings };
}

/** Fits and resolves every section of a take against the sequence's moves. */
export function resolveTakeTiming(
  timing: TakeTiming,
  moveBeats: readonly number[]
): ResolvedTakeTiming {
  return {
    takeKey: timing.takeKey,
    movesPerPass: moveBeats.length,
    sections: timing.sections.map((section) =>
      resolveSection(section, moveBeats, {
        sequenceId: timing.sequenceId,
        takeKey: timing.takeKey,
        updatedAt: timing.updatedAt,
      })
    ),
  };
}

/**
 * The arrival position at a media time, or null when nothing is mapped.
 * Between sections the earlier section holds its last pose; before the first
 * mapped section the first one holds its opening.
 */
export function takePositionAt(
  resolved: ResolvedTakeTiming,
  mediaSeconds: number
): number | null {
  const mapped = resolved.sections.filter((section) => section.map);
  if (mapped.length === 0) return null;
  let chosen = mapped[0]!;
  for (const section of mapped) {
    if (mediaSeconds >= section.startSeconds) chosen = section;
  }
  const clamped = Math.min(
    chosen.endSeconds,
    Math.max(chosen.startSeconds, mediaSeconds)
  );
  return mediaTimeToSequencePosition(chosen.map!, clamped);
}

/** True when every section has a fitted grid. */
export function isTakeTimingMapped(resolved: ResolvedTakeTiming): boolean {
  return resolved.sections.every((section) => section.map !== null);
}

/**
 * Seeds a take timing from a legacy step map. Its marks are arrivals - mark 0
 * the opening pose - so they become taps on positions 0, 1, 2, … followed
 * as-is, which reproduces the old map while making it editable.
 */
export function takeTimingFromLegacyMarks(input: {
  sequenceId: string;
  takeKey: string;
  durationSeconds: number;
  marks: readonly number[];
  movesPerPass: number;
  now: number;
}): TakeTiming | null {
  const marks = input.marks.filter(
    (mark) => Number.isFinite(mark) && mark >= 0
  );
  if (marks.length < 2) return null;
  const intervals = marks.slice(1).map((mark, index) => mark - marks[index]!);
  const sorted = [...intervals].sort((left, right) => left - right);
  const medianInterval = sorted[Math.floor(sorted.length / 2)]!;
  const bpm = Math.min(
    PLAYBACK_MAX_BPM,
    Math.max(PLAYBACK_MIN_BPM, 60 / medianInterval)
  );
  return {
    schemaVersion: 1,
    sequenceId: input.sequenceId,
    takeKey: input.takeKey,
    sections: [
      {
        ...createTimingSection({
          id: "section-1",
          startSeconds: 0,
          endSeconds: Math.max(input.durationSeconds, marks[marks.length - 1]! + 0.01),
          bpm,
        }),
        snap: "taps",
        taps: marks,
        firstTapPosition: 0,
      },
    ],
    updatedAt: input.now,
  };
}
