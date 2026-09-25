import { z } from "zod";
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
 * Only what Austen chose is stored - taps, tempo, beat 1, nudges. The grid is
 * recomputed from them, so a better fitter improves every saved take.
 *
 * A map is only as good as its labels, and both target sequences repeat the
 * same four letters four times over, so a map a whole group off still shows
 * the right letter. Beat 1 is therefore a moment Austen marks rather than
 * whichever tap came first, and a take counts as checked only once he has
 * confirmed it against the video.
 */

/**
 * The tempos a take can be typed at. A take's BPM never drives the engine -
 * the map does - so it has its own range rather than the playback limits.
 */
export const TAKE_MIN_BPM = 20;
export const TAKE_MAX_BPM = 300;

/**
 * One frame at 30 fps. No move resolves shorter, and a dragged landing stops
 * this far from its neighbours.
 */
export const MIN_MOVE_SECONDS = 1 / 30;

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
    bpm: z.number().finite().min(TAKE_MIN_BPM).max(TAKE_MAX_BPM),
    /** "locked" holds the typed BPM; "follow" fits the video's own within ±5%. */
    tempo: z.enum(["locked", "follow"]),
    /** "grid": even landings. "taps": each matched tap is its landing. */
    snap: z.enum(["grid", "taps"]),
    taps: z.array(MediaSecondsSchema),
    /**
     * The position the earliest matched tap marks. 1 is move 1's landing.
     * Used only while no beat 1 is marked.
     */
    firstTapPosition: z.number().int().nonnegative(),
    /**
     * Media time Austen marked as move 1's landing. The landing nearest it is
     * position 1 whatever the taps do; see `fitTapsToGrid`.
     */
    beatOneSeconds: z.number().finite().optional(),
    /**
     * The last landing the performer makes in this section. Past it every
     * layer holds that pose. Unset, a tapped section ends at its last tapped
     * landing and an untapped one (tempo and beat 1 only) runs to its end.
     */
    lastPosition: z.number().int().nonnegative().optional(),
    /** Whole-grid nudge, seconds; the UI moves it a frame at a time. */
    offsetSeconds: z.number().finite(),
    /**
     * Landings Austen dragged, one per position. They ignore the nudge: each
     * is a moment he placed by eye.
     */
    overrides: z.array(TimingOverrideSchema),
  })
  .strict()
  .refine((section) => section.endSeconds > section.startSeconds, {
    message: "A timing section must end after it starts",
    path: ["endSeconds"],
  })
  .refine(
    (section) =>
      new Set(section.overrides.map((override) => override.position)).size ===
      section.overrides.length,
    { message: "A landing can be dragged only once", path: ["overrides"] }
  );

export type TimingSection = z.infer<typeof TimingSectionSchema>;

export const TakeTimingSchema = z
  .object({
    schemaVersion: z.literal(1),
    sequenceId: IdSchema,
    takeKey: IdSchema,
    sections: z.array(TimingSectionSchema).min(1),
    /**
     * The move lengths the timing was confirmed against. When the sequence
     * changes, the saved taps no longer mean the same landings.
     */
    movesKey: z.string().optional(),
    /** When Austen said the map looks right. Any edit clears it. */
    confirmedAt: z.number().finite().int().nonnegative().nullable().optional(),
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
 * What the performance does at a split:
 * - `continues`: it carries on through (the performer changed tempo), so the
 *   right-hand side keeps counting from the left's labels.
 * - `restarts`: it starts over at move 1 (an edited video whose slow replay
 *   begins from the opening pose). Dragged landings and the end come along,
 *   renumbered to match.
 */
export type SplitContinuity = "continues" | "restarts";

/**
 * Splits the section that contains `atSeconds` in two. Taps and overrides
 * stay with the side they fall on; the right-hand side keeps the tempo,
 * snap and nudge.
 */
export function splitTimingSection(
  timing: TakeTiming,
  atSeconds: number,
  newId: string,
  now: number,
  moveBeats: readonly number[],
  continuity: SplitContinuity
): TakeTiming {
  const index = timing.sections.findIndex(
    (section) =>
      atSeconds > section.startSeconds + 0.25 &&
      atSeconds < section.endSeconds - 0.25
  );
  if (index < 0) return timing;
  const section = timing.sections[index]!;
  const fit = fitSection(section, moveBeats);
  const continuedFrom = fit?.labels.find(
    (label) => label.seconds >= atSeconds && label.position !== null
  )?.position;
  const { lastPosition: _leftEnd, ...leftBase } = section;
  const left: TimingSection = {
    ...leftBase,
    endSeconds: atSeconds,
    taps: section.taps.filter((tap) => tap < atSeconds),
    overrides: section.overrides.filter(
      (override) => override.seconds < atSeconds
    ),
  };
  // Restarting renumbers from the position the right-hand side would have
  // continued at; with no tap to say where that is, carried positions mean
  // nothing and are dropped.
  const renumber =
    continuity === "continues"
      ? 0
      : continuedFrom == null
        ? null
        : 1 - continuedFrom;
  const carriedEnd =
    section.lastPosition === undefined || renumber === null
      ? undefined
      : section.lastPosition + renumber;
  const right: TimingSection = {
    ...createTimingSection({
      id: newId,
      startSeconds: atSeconds,
      endSeconds: section.endSeconds,
      bpm: section.bpm,
    }),
    tempo: section.tempo,
    snap: section.snap,
    taps: section.taps.filter((tap) => tap >= atSeconds),
    firstTapPosition:
      continuity === "restarts"
        ? 1
        : (continuedFrom ?? section.firstTapPosition),
    offsetSeconds: section.offsetSeconds,
    ...(carriedEnd !== undefined && carriedEnd >= 0
      ? { lastPosition: carriedEnd }
      : {}),
    overrides:
      renumber === null
        ? []
        : section.overrides
            .filter((override) => override.seconds >= atSeconds)
            .map((override) => ({
              ...override,
              position: override.position + renumber,
            }))
            .filter((override) => override.position >= 0),
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
  const { lastPosition: _previousEnd, ...previousBase } = previous;
  const merged: TimingSection = {
    ...previousBase,
    endSeconds: section.endSeconds,
    taps: [...previous.taps, ...section.taps],
    overrides: [...previous.overrides, ...section.overrides],
    ...(section.lastPosition !== undefined
      ? { lastPosition: section.lastPosition }
      : {}),
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
  landings: ResolvedLanding[];
  /**
   * The last landing the performer makes; every layer holds it afterwards.
   * Null when the section runs on to its end at the typed tempo.
   */
  endPosition: number | null;
  /**
   * Dragged landings set aside because they no longer sit between their
   * neighbours - typically after beat 1 moved or the taps changed.
   */
  droppedOverrides: number[];
}

export interface ResolvedLanding {
  position: number;
  seconds: number;
  /** A landing Austen dragged into place. */
  pinned: boolean;
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

function sectionTaps(section: TimingSection): number[] {
  return section.taps.filter(
    (tap) => tap >= section.startSeconds && tap <= section.endSeconds
  );
}

/**
 * The section's fit, or null with nothing to fit. A section with a beat-1
 * mark and no taps fits the typed tempo through the mark alone.
 */
export function fitSection(
  section: TimingSection,
  moveBeats: readonly number[]
): TapFitResult | null {
  const taps = sectionTaps(section);
  const fitTaps =
    taps.length > 0
      ? taps
      : section.beatOneSeconds !== undefined
        ? [section.beatOneSeconds]
        : [];
  if (fitTaps.length === 0) return null;
  return fitTapsToGrid({
    taps: fitTaps,
    bpm: section.bpm,
    moveBeats,
    firstTapPosition: section.firstTapPosition,
    beatOneSeconds: section.beatOneSeconds ?? null,
    tempo: section.tempo,
  });
}

/**
 * Performances run in whole passes. A last tap this close to the end of a
 * pass means Austen stopped tapping, not that the performer stopped moving.
 */
function roundUpToPassEnd(position: number, movesPerPass: number): number {
  const slack = Math.min(2, Math.floor(movesPerPass / 4));
  const within = position % movesPerPass;
  return within !== 0 && movesPerPass - within <= slack
    ? position + movesPerPass - within
    : position;
}

interface SectionLandings {
  fit: TapFitResult;
  landings: ResolvedLanding[];
  endPosition: number | null;
  droppedOverrides: number[];
}

/** Every landing that matters to a section, or null with nothing to fit. */
function sectionLandings(
  section: TimingSection,
  moveBeats: readonly number[]
): SectionLandings | null {
  const fit = fitSection(section, moveBeats);
  if (!fit) return null;

  const clock = createBeatClock(moveBeats);
  const spb = fit.secondsPerBeat;
  const gridAt = (position: number) =>
    fit.originSeconds + spb * clock.beatsBefore(position) + section.offsetSeconds;
  const tapped = sectionTaps(section).length > 0;

  const tappedAt = new Map<number, number>();
  if (section.snap === "taps" && tapped) {
    for (const label of fit.labels) {
      if (label.position !== null) {
        tappedAt.set(label.position, label.seconds + section.offsetSeconds);
      }
    }
  }
  const tappedPositions = [...tappedAt.keys()].sort(
    (left, right) => left - right
  );
  const snappedAt = (position: number): number => {
    if (tappedPositions.length === 0) return gridAt(position);
    const exact = tappedAt.get(position);
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
      return (
        tappedAt.get(before)! +
        (tappedAt.get(after)! - tappedAt.get(before)!) * share
      );
    }
    const nearest = (before ?? after)!;
    return tappedAt.get(nearest)! + spb * (beats - clock.beatsBefore(nearest));
  };
  const overrides = new Map(
    section.overrides.map((override) => [override.position, override.seconds])
  );
  const landingAt = (position: number) =>
    overrides.get(position) ?? snappedAt(position);

  // Every position whose landing could matter to this section: from the last
  // landing at or before its start (never below the opening pose) to where
  // the performance ends. Taps say where that is - the grid does not run on
  // after the performer stops - unless Austen set it; with no taps at all
  // the typed tempo runs to the section's end.
  let firstPosition = Math.max(
    0,
    clock.nearestPosition(
      (section.startSeconds - section.offsetSeconds - fit.originSeconds) / spb
    ) - 1
  );
  while (firstPosition > 0 && landingAt(firstPosition) > section.startSeconds) {
    firstPosition -= 1;
  }
  const matchedPositions = fit.labels
    .map((label) => label.position)
    .filter((position): position is number => position !== null);
  const endPosition =
    section.lastPosition ??
    (tapped && matchedPositions.length > 0
      ? roundUpToPassEnd(
          Math.max(
            ...matchedPositions,
            ...section.overrides.map((override) => override.position)
          ),
          clock.movesPerPass
        )
      : null);
  let lastPosition = firstPosition + 1;
  if (endPosition === null) {
    while (landingAt(lastPosition) < section.endSeconds) lastPosition += 1;
  } else {
    lastPosition = Math.max(lastPosition, endPosition);
  }

  const landings: ResolvedLanding[] = [];
  for (let position = firstPosition; position <= lastPosition; position += 1) {
    landings.push({
      position,
      seconds: landingAt(position),
      pinned: overrides.has(position),
    });
  }
  // A dragged landing that no longer sits between its neighbours would make
  // the moves around it flash by; it goes back on the grid and is reported.
  const droppedOverrides: number[] = [];
  landings.forEach((landing, index) => {
    if (!landing.pinned) return;
    const previous = landings[index - 1];
    const next = landings[index + 1];
    if (
      (previous && landing.seconds < previous.seconds + MIN_MOVE_SECONDS) ||
      (next && landing.seconds > next.seconds - MIN_MOVE_SECONDS)
    ) {
      landing.seconds = snappedAt(landing.position);
      landing.pinned = false;
      droppedOverrides.push(landing.position);
    }
  });
  enforceIncreasing(landings);

  return {
    fit,
    landings,
    endPosition: endPosition === null ? null : lastPosition,
    droppedOverrides,
  };
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
    endPosition: null,
    droppedOverrides: [],
  };
  const resolved = sectionLandings(section, moveBeats);
  if (!resolved) return empty;
  const { fit, landings } = resolved;

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

  return {
    ...empty,
    map,
    fit,
    landings,
    endPosition: resolved.endPosition,
    droppedOverrides: resolved.droppedOverrides,
  };
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

/** Where a take is at one media time, and where its performance ends. */
export interface TakeSample {
  /** Arrival position: 0 the opening pose, k move k's landing. */
  arrival: number;
  /** The last landing of the section in effect; null when it runs on. */
  endArrival: number | null;
}

/**
 * The take at a media time, or null when nothing is mapped. Between sections
 * the earlier section holds its last pose; before the first mapped section
 * the first one holds its opening.
 */
export function takeSampleAt(
  resolved: ResolvedTakeTiming,
  mediaSeconds: number
): TakeSample | null {
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
  return {
    arrival: mediaTimeToSequencePosition(chosen.map!, clamped),
    endArrival: chosen.endPosition,
  };
}

export function takePositionAt(
  resolved: ResolvedTakeTiming,
  mediaSeconds: number
): number | null {
  return takeSampleAt(resolved, mediaSeconds)?.arrival ?? null;
}

/** True when every section has a fitted grid. */
export function isTakeTimingMapped(resolved: ResolvedTakeTiming): boolean {
  return resolved.sections.every((section) => section.map !== null);
}

/** Identifies a sequence's move lengths, so a changed sequence is noticed. */
export function takeTimingMovesKey(moveBeats: readonly number[]): string {
  return `beats:${moveBeats.join(",")}`;
}

/**
 * - `untapped`: nothing to fit yet.
 * - `unconfirmed`: fitted, but Austen has not checked it against the video.
 * - `confirmed`: checked, against these moves.
 * - `stale`: checked against a sequence that has since changed; the taps are
 *   kept, but they may mark different landings now.
 */
export type TakeTimingStatus =
  | "untapped"
  | "unconfirmed"
  | "confirmed"
  | "stale";

export function takeTimingStatus(
  timing: TakeTiming,
  moveBeats: readonly number[]
): TakeTimingStatus {
  const hasInput = timing.sections.every(
    (section) =>
      sectionTaps(section).length > 0 || section.beatOneSeconds !== undefined
  );
  if (!hasInput) return "untapped";
  if (
    timing.movesKey !== undefined &&
    timing.movesKey !== takeTimingMovesKey(moveBeats)
  ) {
    return "stale";
  }
  return timing.confirmedAt != null ? "confirmed" : "unconfirmed";
}

/** Marks the timing checked against these moves. */
export function confirmTakeTiming(
  timing: TakeTiming,
  moveBeats: readonly number[],
  now: number
): TakeTiming {
  return {
    ...timing,
    movesKey: takeTimingMovesKey(moveBeats),
    confirmedAt: now,
    updatedAt: now,
  };
}

/**
 * Applies an edit to one section. Any edit means the map is no longer the
 * one Austen confirmed, so the confirmation goes with it.
 */
export function editTimingSection(
  timing: TakeTiming,
  sectionId: string,
  edit: (section: TimingSection) => TimingSection,
  now: number
): TakeTiming {
  return {
    ...timing,
    sections: timing.sections.map((section) =>
      section.id === sectionId ? edit(section) : section
    ),
    confirmedAt: null,
    updatedAt: now,
  };
}

/**
 * The landing nearest a media time under the section's current fit. Before
 * the opening pose the grid carries on backwards a pass at a time, so beat 1
 * can move to a moment ahead of every tap.
 */
function landingNear(
  section: TimingSection,
  fit: TapFitResult,
  clock: ReturnType<typeof createBeatClock>,
  seconds: number
): number {
  const beats =
    (seconds - section.offsetSeconds - fit.originSeconds) / fit.secondsPerBeat;
  if (beats >= 0) return clock.nearestPosition(beats);
  const passesBack = Math.ceil(-beats / clock.beatsPerPass);
  return (
    clock.nearestPosition(beats + passesBack * clock.beatsPerPass) -
    passesBack * clock.movesPerPass
  );
}

/**
 * Makes the landing nearest `seconds` move 1's. Dragged landings and the
 * performance's end are physical moments, so they keep their moments and
 * take the new numbers with them.
 */
export function setBeatOneAt(
  section: TimingSection,
  moveBeats: readonly number[],
  seconds: number
): TimingSection {
  const fit = fitSection(section, moveBeats);
  if (!fit) return { ...section, beatOneSeconds: seconds };
  const clock = createBeatClock(moveBeats);
  const current = landingNear(section, fit, clock, seconds);
  const shift = 1 - current;
  const { lastPosition, ...rest } = section;
  const shiftedEnd =
    lastPosition === undefined ? undefined : lastPosition + shift;
  return {
    ...rest,
    // Stored on the landing itself, the middle of its catch, so later taps
    // that nudge the grid cannot tip it onto a neighbour.
    beatOneSeconds:
      fit.originSeconds + fit.secondsPerBeat * clock.beatsBefore(current),
    overrides: section.overrides
      .map((override) => ({ ...override, position: override.position + shift }))
      .filter((override) => override.position >= 0),
    ...(shiftedEnd !== undefined && shiftedEnd >= 0
      ? { lastPosition: shiftedEnd }
      : {}),
  };
}

/**
 * Moves beat 1 by whole landings: +1 makes today's landing 2 the new 1, -1
 * makes the opening pose's moment move 1's landing.
 */
export function moveBeatOne(
  section: TimingSection,
  moveBeats: readonly number[],
  landings: number
): TimingSection {
  const fit = fitSection(section, moveBeats);
  if (!fit || landings === 0) return section;
  const clock = createBeatClock(moveBeats);
  return setBeatOneAt(
    section,
    moveBeats,
    fit.originSeconds +
      fit.secondsPerBeat * clock.beatsBefore(1 + landings) +
      section.offsetSeconds
  );
}

/** Ends the performance at the landing nearest `seconds`. */
export function setPerformanceEndAt(
  section: TimingSection,
  moveBeats: readonly number[],
  seconds: number
): TimingSection {
  const fit = fitSection(section, moveBeats);
  if (!fit) return section;
  const clock = createBeatClock(moveBeats);
  return {
    ...section,
    lastPosition: landingNear(section, fit, clock, seconds),
  };
}

/**
 * Where a landing can be dragged: strictly between its neighbours, a frame
 * clear of each. Null when the section has no such landing.
 */
export function landingDragRange(
  section: TimingSection,
  moveBeats: readonly number[],
  position: number
): { min: number; max: number } | null {
  const resolved = sectionLandings(section, moveBeats);
  const index =
    resolved?.landings.findIndex((landing) => landing.position === position) ??
    -1;
  if (!resolved || index < 0) return null;
  const previous = resolved.landings[index - 1];
  const next = resolved.landings[index + 1];
  return {
    min: Math.max(0, previous ? previous.seconds + MIN_MOVE_SECONDS : 0),
    max: next ? next.seconds - MIN_MOVE_SECONDS : Number.POSITIVE_INFINITY,
  };
}

/** Pins a landing where Austen dropped it, stopped at its neighbours. */
export function setLandingAt(
  section: TimingSection,
  moveBeats: readonly number[],
  position: number,
  seconds: number
): TimingSection {
  const range = landingDragRange(section, moveBeats, position);
  if (!range || range.max < range.min) return section;
  return {
    ...section,
    overrides: [
      ...section.overrides.filter((override) => override.position !== position),
      { position, seconds: Math.min(range.max, Math.max(range.min, seconds)) },
    ].sort((left, right) => left.position - right.position),
  };
}

/** Hands a dragged landing back to the grid. */
export function releaseLanding(
  section: TimingSection,
  position: number
): TimingSection {
  return {
    ...section,
    overrides: section.overrides.filter(
      (override) => override.position !== position
    ),
  };
}

/**
 * Seeds a take timing from a legacy step map. Its marks are arrivals - mark 0
 * the opening pose, mark k move k's landing, the optional end mark the landing
 * after the last - so each becomes a pinned landing on its position, which
 * reproduces the old map exactly, and the performance ends on the last one.
 * Marks 1 onward are also the taps, so releasing the pins hands the take to a
 * fitted grid. Mark 0 is left out of the fit: a performer can hold the
 * opening pose any length of time, so it says nothing about the tempo.
 */
export function takeTimingFromLegacyMarks(input: {
  sequenceId: string;
  takeKey: string;
  durationSeconds: number;
  marks: readonly number[];
  endMark?: number;
  now: number;
}): TakeTiming | null {
  const marks = input.marks.filter(
    (mark) => Number.isFinite(mark) && mark >= 0
  );
  if (
    input.endMark !== undefined &&
    Number.isFinite(input.endMark) &&
    input.endMark > (marks[marks.length - 1] ?? Infinity)
  ) {
    marks.push(input.endMark);
  }
  if (marks.length < 2) return null;
  if (marks.some((mark, index) => index > 0 && mark <= marks[index - 1]!)) {
    return null;
  }
  const intervals = marks.slice(1).map((mark, index) => mark - marks[index]!);
  const sorted = [...intervals].sort((left, right) => left - right);
  const medianInterval = sorted[Math.floor(sorted.length / 2)]!;
  const bpm = Math.min(
    TAKE_MAX_BPM,
    Math.max(TAKE_MIN_BPM, 60 / medianInterval)
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
        taps: marks.slice(1),
        firstTapPosition: 1,
        lastPosition: marks.length - 1,
        overrides: marks.map((seconds, position) => ({ position, seconds })),
      },
    ],
    updatedAt: input.now,
  };
}
