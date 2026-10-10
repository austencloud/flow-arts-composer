import { z } from "zod";
import {
  SequenceTimeMapSchema,
  mediaTimeToSequencePosition,
  sequencePositionToMediaTime,
  type SequenceTimeAnchor,
  type SequenceTimeMap,
} from "#lib/shared/media-composition/domain/sequence-time-map.js";
import {
  createBeatClock,
  fitTapsToGrid,
  type TapFitResult,
} from "#lib/shared/media-composition/domain/tap-fit.js";

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
 * A part cut from a fitted grid keeps that grid's exact tempo, which a slow
 * or fast performance can take past these.
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
    bpm: z.number().finite().positive(),
    /** "locked" holds the typed BPM; "follow" fits the video's own within ±5%. */
    tempo: z.enum(["locked", "follow"]),
    /** "grid": even landings. "taps": each matched tap is its landing. */
    snap: z.enum(["grid", "taps"]),
    /** Fraction of each move interval spent holding its previous landing. */
    landingHoldRatio: z.number().finite().min(0).max(0.9).optional(),
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
     * The position the `beatOneSeconds` landing takes, when not move 1. The
     * right of a "keep counting" split marks its count at the cut, so a new
     * tempo there pivots about the cut rather than the take's first move.
     */
    beatOnePosition: z.number().int().positive().optional(),
    /**
     * The last landing the performer makes. Past it every layer holds that
     * pose. Parts that share one count share one end, stored on the part it
     * falls in. Unset, a tapped performance ends at its last tapped landing
     * and an untapped one (tempo and beat 1 only) runs to its end.
     */
    lastPosition: z.number().int().nonnegative().optional(),
    /**
     * An end guessed from the taps before a "keep counting" split, set on an
     * untapped right side so it holds where the whole take did. It stands only
     * while no part sharing its count has taps; unlike `lastPosition`, Austen
     * never chose it.
     */
    carriedEnd: z.number().int().nonnegative().optional(),
    /**
     * Set on the left of a "keep counting" split: the next part counts on
     * from this one. While it does, the two are drawn as one performance,
     * so this part runs to its cut when the performance ends after it.
     */
    continuesIntoNext: z.literal(true).optional(),
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
 * The same timing for a copy of its video that holds the old one
 * `offsetSeconds` in, such as the whole recording a clip was cut from. Every
 * media time moves with the footage; the nudge is relative and stays. The
 * sections still cover the whole video, so the first opens at its start and
 * the last runs to its end. It counts as an edit made `now`, so it outranks
 * a timing the editor opened for the copy before it arrived.
 */
export function shiftTakeTiming(
  timing: TakeTiming,
  offsetSeconds: number,
  take: { takeKey: string; durationSeconds: number },
  now: number
): TakeTiming {
  const at = (seconds: number) => seconds + offsetSeconds;
  const last = timing.sections.length - 1;
  return {
    ...timing,
    takeKey: take.takeKey,
    updatedAt: now,
    sections: timing.sections.map((section, index) => ({
      ...section,
      startSeconds: index === 0 ? 0 : at(section.startSeconds),
      endSeconds:
        index === last ? take.durationSeconds : at(section.endSeconds),
      taps: section.taps.map(at),
      ...(section.beatOneSeconds !== undefined
        ? { beatOneSeconds: at(section.beatOneSeconds) }
        : {}),
      overrides: section.overrides.map((override) => ({
        ...override,
        seconds: at(override.seconds),
      })),
    })),
  };
}

/**
 * The timing for a new recording of the same take, such as a re-run app
 * capture. Its moments are not the old ones, so it counts as unchecked again.
 * Sections, taps, dragged landings and beat 1 past its end are dropped, and
 * the last section left runs to that end.
 */
export function rerecordedTakeTiming(
  timing: TakeTiming,
  take: { takeKey: string; durationSeconds: number },
  now: number
): TakeTiming {
  const end = take.durationSeconds;
  const kept = timing.sections.filter(
    (section, index) => index === 0 || section.startSeconds < end
  );
  const last = kept.length - 1;
  const opened = (section: TimingSection, index: number) =>
    index === 0 ? { ...section, startSeconds: 0 } : section;
  return {
    ...timing,
    takeKey: take.takeKey,
    confirmedAt: null,
    updatedAt: now,
    sections: kept.map((section, index) => {
      if (index < last) return opened(section, index);
      // Nothing follows it now, and a beat 1 past the end goes too.
      const {
        continuesIntoNext: _carries,
        beatOneSeconds,
        beatOnePosition,
        ...rest
      } = opened(section, index);
      const beatOneGone = beatOneSeconds !== undefined && beatOneSeconds > end;
      return {
        ...rest,
        endSeconds: end,
        taps: section.taps.filter((tap) => tap <= end),
        overrides: section.overrides.filter(
          (override) => override.seconds <= end
        ),
        ...(!beatOneGone && beatOneSeconds !== undefined
          ? { beatOneSeconds }
          : {}),
        ...(!beatOneGone && beatOnePosition !== undefined
          ? { beatOnePosition }
          : {}),
      };
    }),
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

type BeatClock = ReturnType<typeof createBeatClock>;

/**
 * The beat-1 mark that keeps the left of a split counting as the whole
 * section did. Fewer taps can count differently - an early tap the whole take
 * set aside becomes move 1 again - so the left is marked on its first counted
 * landing, or with none on the landing nearest the cut. A mark already inside
 * the left stays.
 */
function leftCount(
  section: TimingSection,
  fit: TapFitResult | null,
  clock: BeatClock,
  atSeconds: number
): Pick<TimingSection, "beatOneSeconds" | "beatOnePosition"> {
  const { beatOneSeconds, beatOnePosition } = section;
  const kept = {
    ...(beatOneSeconds !== undefined ? { beatOneSeconds } : {}),
    ...(beatOnePosition !== undefined ? { beatOnePosition } : {}),
  };
  if (
    !fit ||
    (beatOneSeconds !== undefined &&
      beatOneSeconds + section.offsetSeconds < atSeconds)
  ) {
    return kept;
  }
  const position =
    fit.labels.find(
      (label) =>
        label.position !== null &&
        label.position >= 1 &&
        label.seconds + section.offsetSeconds < atSeconds
    )?.position ?? Math.max(1, landingNear(section, fit, clock, atSeconds));
  return {
    beatOneSeconds:
      fit.originSeconds + fit.secondsPerBeat * clock.beatsBefore(position),
    ...(position !== 1 ? { beatOnePosition: position } : {}),
  };
}

/**
 * The part a tap at `seconds` belongs to: the last one whose grid draws that
 * moment at or after its start. Each part nudges its own grid, so a tap near a
 * cut goes with the landing it marks rather than the raw moment.
 */
function tapOwner(timing: TakeTiming, seconds: number): TimingSection {
  for (let index = timing.sections.length - 1; index > 0; index -= 1) {
    const part = timing.sections[index]!;
    if (seconds + part.offsetSeconds >= part.startSeconds) return part;
  }
  return timing.sections[0]!;
}

/**
 * Adds a tap at `seconds` to the part whose landing it marks. The parts
 * after it that keep its count count on from it as it now is: a part that
 * started over has no count until its first tap.
 */
export function addTakeTap(
  timing: TakeTiming,
  seconds: number,
  moveBeats: readonly number[]
): TakeTiming {
  const owner = tapOwner(timing, seconds);
  const index = timing.sections.indexOf(owner);
  const sections = [...timing.sections];
  sections[index] = {
    ...owner,
    taps: [...owner.taps, seconds].sort((left, right) => left - right),
  };
  recountChain(sections, index + 1, owner, moveBeats, null);
  return { ...timing, sections };
}

/**
 * Splits the section that contains `atSeconds` in two. Taps and overrides
 * stay with the side their landing is drawn on, and the left keeps the count
 * the whole section gave it; the right-hand side keeps the tempo, snap and
 * nudge. A split that keeps counting changes nothing on screen until one side
 * is edited: a right-hand side with no taps of its own carries on along the
 * grid it was cut from, the left runs up to the cut for as long as the
 * performance carries on into the right, and each side draws the landings
 * beside the cut as the other does (see `sectionLandings`).
 *
 * Keeping count needs a grid to count from. With nothing fitted yet the
 * right-hand side has no count to carry and numbers its taps from its first.
 * Starting over renumbers the parts after it that kept the section's count.
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
  const resolved = sectionLandings(
    section,
    moveBeats,
    timing.sections.slice(index + 1),
    timing.sections.slice(0, index)
  );
  const fit = resolved?.fit ?? null;
  const clock = createBeatClock(moveBeats);
  // A tap goes with the side its landing is drawn on, nudge and all.
  const beforeCut = (tap: number) => tap + section.offsetSeconds < atSeconds;
  const continuedFrom = fit?.labels.find(
    (label) => !beforeCut(label.seconds) && label.position !== null
  )?.position;
  const renumber = continuedFrom == null ? null : 1 - continuedFrom;
  // Where the performance ends before the cut, the end belongs to the left.
  const end = resolved?.endPosition ?? null;
  const endLanding =
    end === null
      ? undefined
      : resolved?.landings.find((landing) => landing.position === end);
  const endedBeforeCut =
    endLanding !== undefined && endLanding.seconds <= atSeconds;
  const {
    lastPosition: _leftEnd,
    carriedEnd: _leftCarriedEnd,
    continuesIntoNext: _leftCarries,
    beatOneSeconds: _leftMark,
    beatOnePosition: _leftMarkCount,
    ...leftBase
  } = section;
  const left: TimingSection = {
    ...leftBase,
    ...leftCount(section, fit, clock, atSeconds),
    endSeconds: atSeconds,
    taps: section.taps.filter(beforeCut),
    overrides: section.overrides.filter(
      (override) => override.seconds < atSeconds
    ),
  };
  // The left keeps an end that was set or carried; one guessed from the taps
  // its own taps guess again.
  const leftEnded: TimingSection = {
    ...left,
    ...(section.lastPosition !== undefined
      ? { lastPosition: section.lastPosition }
      : {}),
    ...(section.carriedEnd !== undefined
      ? { carriedEnd: section.carriedEnd }
      : {}),
  };
  const rightTaps = section.taps.filter((tap) => !beforeCut(tap));
  const rightBase: TimingSection = {
    ...createTimingSection({
      id: newId,
      startSeconds: atSeconds,
      endSeconds: section.endSeconds,
      bpm: section.bpm,
    }),
    tempo: section.tempo,
    snap: section.snap,
    ...(section.landingHoldRatio !== undefined
      ? { landingHoldRatio: section.landingHoldRatio }
      : {}),
    taps: rightTaps,
    offsetSeconds: section.offsetSeconds,
    ...(section.continuesIntoNext ? { continuesIntoNext: true as const } : {}),
  };
  const rightOverrides = section.overrides.filter(
    (override) => override.seconds >= atSeconds
  );

  let sides: [TimingSection, TimingSection];
  if (continuity === "continues") {
    // The right's count is marked at the cut: the landing nearest it on the
    // left's grid, under the same number. A new tempo after the cut then
    // pivots there, where the two parts meet, and the right's taps take the
    // count whether they were tapped before the split or after it. A left
    // with no landing of its own counted - only taps before the opening pose
    // - has no grid to go by, so the whole section's is used.
    const leftFit = fitSection(left, moveBeats);
    const countFit = leftFit?.labels.some((label) => label.position !== null)
      ? leftFit
      : fit;
    const carried = countFit
      ? Math.max(1, landingNear(section, countFit, clock, atSeconds))
      : null;
    const untapped = rightTaps.length === 0;
    sides = [
      // Whether the performance ran on past the left's last tap is for the
      // two parts together to say, each time they are drawn: tapping the
      // right after the split must not leave the left frozen short of the
      // cut.
      { ...(endedBeforeCut ? leftEnded : left), continuesIntoNext: true },
      {
        ...rightBase,
        firstTapPosition: continuedFrom ?? section.firstTapPosition,
        ...(countFit && carried !== null
          ? {
              beatOneSeconds:
                countFit.originSeconds +
                countFit.secondsPerBeat * clock.beatsBefore(carried),
              ...(carried !== 1 ? { beatOnePosition: carried } : {}),
              // With no taps the part runs on the grid it was cut from, so
              // it takes that grid's exact tempo.
              ...(untapped ? { bpm: 60 / countFit.secondsPerBeat } : {}),
            }
          : {}),
        // An end Austen set stays with the side the performance ends in;
        // the two sides share it. A guessed one holds an untapped right
        // where the whole take held, until it has taps of its own.
        ...(section.lastPosition !== undefined
          ? endedBeforeCut
            ? {}
            : { lastPosition: section.lastPosition }
          : untapped && end !== null
            ? { carriedEnd: end }
            : {}),
        overrides: rightOverrides,
      },
    ];
  } else {
    // Restarting renumbers from the position the right-hand side would have
    // continued at; with no tap to say where that is, carried positions mean
    // nothing and are dropped. An end before the cut is the left's alone.
    const restartedEnd =
      section.lastPosition === undefined || renumber === null || endedBeforeCut
        ? undefined
        : section.lastPosition + renumber;
    sides = [
      endedBeforeCut ? leftEnded : left,
      {
        ...rightBase,
        firstTapPosition: 1,
        ...(restartedEnd !== undefined && restartedEnd >= 0
          ? { lastPosition: restartedEnd }
          : {}),
        overrides:
          renumber === null
            ? []
            : rightOverrides
                .map((override) => ({
                  ...override,
                  position: override.position + renumber,
                }))
                .filter((override) => override.position >= 0),
      },
    ];
  }
  const sections = [...timing.sections];
  sections.splice(index, 1, ...sides);
  if (continuity === "restarts") {
    recountChain(sections, index + 2, section, moveBeats, renumber);
  }
  return { ...timing, sections, updatedAt: now };
}

/**
 * Where a later part's landings fall in the joined count. Each keeps its
 * moment on the footage: the landing as the part drew it before any drag
 * takes the number of the joined landing nearest that moment. Parts at
 * different tempos do not number alike, so no single shift would do. Null
 * when either side has no grid to compare.
 */
function joinedPositions(
  joined: TimingSection,
  part: TimingSection,
  moveBeats: readonly number[]
): ((position: number) => number) | null {
  const ownFit = fitSection(part, moveBeats);
  const joinedFit = fitSection(joined, moveBeats);
  if (!ownFit || !joinedFit) return null;
  const clock = createBeatClock(moveBeats);
  const drawn = snappedLandings(
    part,
    ownFit,
    clock,
    tappedLandings(part, ownFit)
  );
  return (position) => landingNear(joined, joinedFit, clock, drawn(position));
}

/**
 * Joins a section into the one before it, keeping the earlier one's tempo.
 * The later part's dragged landings and end are moments on the footage, so
 * they take the joined count at those moments; where the earlier part already
 * dragged the same landing, the earlier drag stays. A later part with no taps
 * adds no performance, so without an end of its own the earlier part's end
 * stands, as does one set on either part of one performance and one the
 * performance reached before the later part began. Parts that kept the later
 * part's count count on from the joined one.
 */
export function mergeTimingSectionIntoPrevious(
  timing: TakeTiming,
  sectionId: string,
  now: number,
  moveBeats: readonly number[]
): TakeTiming {
  const index = timing.sections.findIndex(
    (section) => section.id === sectionId
  );
  if (index <= 0) return timing;
  const previous = timing.sections[index - 1]!;
  const section = timing.sections[index]!;
  const {
    lastPosition: _previousEnd,
    carriedEnd: _previousCarriedEnd,
    continuesIntoNext: _previousCarries,
    ...previousBase
  } = previous;
  const joined: TimingSection = {
    ...previousBase,
    endSeconds: section.endSeconds,
    taps: [...previous.taps, ...section.taps],
    overrides: previous.overrides,
    ...(section.continuesIntoNext ? { continuesIntoNext: true as const } : {}),
  };
  const following = timing.sections.slice(index + 1);
  const toJoined = joinedPositions(joined, section, moveBeats);
  // One drag per landing: the earlier part's stands, and of two later drags
  // that land on one joined landing the first does.
  const taken = new Set(
    previous.overrides.map((override) => override.position)
  );
  const carried: TimingOverride[] = [];
  for (const override of toJoined === null ? [] : section.overrides) {
    const position = toJoined!(override.position);
    if (position < 0 || taken.has(position)) continue;
    taken.add(position);
    carried.push({ ...override, position });
  }
  let end: number | undefined;
  let carriedEnd: number | undefined;
  if (section.lastPosition !== undefined && toJoined !== null) {
    end = toJoined(section.lastPosition);
  } else if (section.taps.length === 0) {
    end = previous.lastPosition;
    // A guessed end carries on only while there are no taps to guess from.
    if (end === undefined && joined.taps.length === 0) {
      carriedEnd =
        section.carriedEnd !== undefined && toJoined !== null
          ? toJoined(section.carriedEnd)
          : previous.carriedEnd;
    }
  } else if (previous.lastPosition !== undefined) {
    if (keepsCount(previous, section, moveBeats)) {
      // One performance: the end set on either part was the whole one's.
      end = previous.lastPosition;
    } else if (!previous.continuesIntoNext) {
      // The later part started over after the performance had stopped:
      // the stop still holds once the two are one.
      const stop = sectionLandings(
        previous,
        moveBeats,
        [section, ...following],
        timing.sections.slice(0, index - 1)
      )?.landings.find(
        (landing) => landing.position === previous.lastPosition
      );
      if (stop && stop.seconds <= section.startSeconds) {
        end = previous.lastPosition;
      }
    }
  }
  const merged: TimingSection = {
    ...joined,
    overrides: [...previous.overrides, ...carried].sort(
      (left, right) => left.position - right.position
    ),
    ...(end !== undefined && end >= 0 ? { lastPosition: end } : {}),
    ...(carriedEnd !== undefined && carriedEnd >= 0 ? { carriedEnd } : {}),
  };
  const sections = [...timing.sections];
  sections.splice(index - 1, 2, merged);
  recountChain(sections, index, section, moveBeats, null);
  return { ...timing, sections, updatedAt: now };
}

export interface ResolvedTimingSection {
  id: string;
  startSeconds: number;
  endSeconds: number;
  landingHoldRatio: number;
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
   * True when a stored end decides `endPosition`: one Austen set, or one a
   * split carried. False when the taps guess it or the section runs on.
   */
  endStored: boolean;
  /**
   * Dragged landings set aside because they no longer sit between their
   * neighbours - typically after beat 1 moved or the taps changed.
   */
  droppedOverrides: number[];
  /**
   * True when this part counts on from the part before it: one performance
   * cut to change tempo, whose parts draw every landing alike.
   */
  countsWithPrevious: boolean;
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

/**
 * The section's fit, or null with nothing to fit. A section with a beat-1
 * mark and no taps fits the typed tempo through the mark alone. A part's taps
 * are the ones whose landings it draws, which near a nudged cut can sit just
 * outside it; see `addTakeTap`.
 */
export function fitSection(
  section: TimingSection,
  moveBeats: readonly number[]
): TapFitResult | null {
  const taps = section.taps;
  const fitTaps =
    taps.length > 0
      ? taps
      : section.beatOneSeconds !== undefined
        ? [section.beatOneSeconds]
        : [];
  if (fitTaps.length === 0) return null;
  const key = [
    section.tempo,
    section.bpm,
    section.firstTapPosition,
    section.beatOneSeconds ?? "",
    section.beatOnePosition ?? "",
    moveBeats.join(","),
    fitTaps.join(","),
  ].join("|");
  const recent = recentFits.get(key);
  if (recent) {
    recentFits.delete(key);
    recentFits.set(key, recent);
    return recent;
  }
  const fit = fitTapsToGrid({
    taps: fitTaps,
    bpm: section.bpm,
    moveBeats,
    firstTapPosition: section.firstTapPosition,
    beatOneSeconds: section.beatOneSeconds ?? null,
    beatOnePosition: section.beatOnePosition,
    tempo: section.tempo,
  });
  recentFits.set(key, fit);
  if (recentFits.size > RECENT_FIT_LIMIT) {
    recentFits.delete(recentFits.keys().next().value!);
  }
  return fit;
}

/**
 * Recent fits by what they were fitted from, the least recently used going
 * first. Parts that share a count ask one another how they count, so a take
 * fits each part several times over, and a tap changes one part while the
 * others' fits carry over. Nothing changes a fit once made, so callers share
 * one.
 */
const recentFits = new Map<string, TapFitResult>();
const RECENT_FIT_LIMIT = 64;

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
  /**
   * Every landing drawn by the parts that share this one's count, this one's
   * among them, in position order.
   */
  table: ResolvedLanding[];
  endPosition: number | null;
  endStored: boolean;
  droppedOverrides: number[];
}

/**
 * The end a part's taps guess: the last landing they match, or a drag past
 * it, rounded up to the end of the pass when close. Null without taps.
 */
function guessEnd(
  section: TimingSection,
  fit: TapFitResult,
  movesPerPass: number
): number | null {
  if (section.taps.length === 0) return null;
  const matched = fit.labels
    .map((label) => label.position)
    .filter((position): position is number => position !== null);
  if (matched.length === 0) return null;
  return roundUpToPassEnd(
    Math.max(
      ...matched,
      ...section.overrides.map((override) => override.position)
    ),
    movesPerPass
  );
}

/**
 * Where a part's own input says the performance ends, whatever the parts
 * around it do: an end Austen set, the taps' guess, or for a part with no
 * taps an end a split carried to it. Null when nothing says.
 */
function ownEnd(
  section: TimingSection,
  moveBeats: readonly number[]
): number | null {
  if (section.lastPosition !== undefined) return section.lastPosition;
  if (section.taps.length === 0) return section.carriedEnd ?? null;
  const fit = fitSection(section, moveBeats);
  return fit ? guessEnd(section, fit, moveBeats.length) : null;
}

interface DrawnLanding {
  position: number;
  seconds: number;
}

/**
 * A tapped part's first counted landing, as it draws it. Null without taps
 * or with none counted.
 */
function firstCounted(
  part: TimingSection,
  moveBeats: readonly number[]
): DrawnLanding | null {
  if (part.taps.length === 0) return null;
  for (const label of fitSection(part, moveBeats)?.labels ?? []) {
    if (label.position !== null) {
      return {
        position: label.position,
        seconds: label.seconds + part.offsetSeconds,
      };
    }
  }
  return null;
}

/**
 * Whether `next` counts on from `section`: cut from it to keep counting, its
 * beat 1 carrying the number the section's grid gives that moment. A part
 * saved before splits marked the cut has only its taps to say, so its first
 * counted tap must carry that number instead.
 */
function keepsCount(
  section: TimingSection,
  next: TimingSection,
  moveBeats: readonly number[]
): boolean {
  if (!section.continuesIntoNext) return false;
  const fit = fitSection(section, moveBeats);
  if (!fit) return false;
  const clock = createBeatClock(moveBeats);
  if (next.beatOneSeconds !== undefined) {
    return (
      landingNear(
        section,
        fit,
        clock,
        next.beatOneSeconds + next.offsetSeconds
      ) === (next.beatOnePosition ?? 1)
    );
  }
  const counted = firstCounted(next, moveBeats);
  return (
    counted !== null &&
    landingNear(section, fit, clock, counted.seconds) === counted.position
  );
}

/**
 * The parts either side of `section` that share its count, nearest first:
 * one performance, cut only to change tempo. `preceding` is in take order.
 */
function countingChain(
  section: TimingSection,
  preceding: readonly TimingSection[],
  following: readonly TimingSection[],
  moveBeats: readonly number[]
): { before: TimingSection[]; after: TimingSection[] } {
  const before: TimingSection[] = [];
  for (let index = preceding.length - 1; index >= 0; index -= 1) {
    const part = preceding[index]!;
    if (!keepsCount(part, before[before.length - 1] ?? section, moveBeats)) {
      break;
    }
    before.push(part);
  }
  const after: TimingSection[] = [];
  for (const part of following) {
    if (!keepsCount(after[after.length - 1] ?? section, part, moveBeats)) {
      break;
    }
    after.push(part);
  }
  return { before, after };
}

/**
 * One tapped landing of the nearest part in `parts` with taps, as that part
 * draws it, chosen by `pick`. Only a part snapped to its taps draws them.
 */
function edgeTap(
  parts: readonly TimingSection[],
  moveBeats: readonly number[],
  pick: (drawn: DrawnLanding[]) => DrawnLanding | undefined
): DrawnLanding | null {
  const part = parts.find((candidate) => candidate.taps.length > 0);
  if (!part || part.snap !== "taps") return null;
  const fit = fitSection(part, moveBeats);
  if (!fit) return null;
  const drawn = fit.labels.flatMap((label) =>
    label.position === null
      ? []
      : [{ position: label.position, seconds: label.seconds + part.offsetSeconds }]
  );
  return pick(drawn) ?? null;
}

/**
 * A part's tapped landings by position, as it draws them. None unless it is
 * snapped to its taps.
 */
function tappedLandings(
  part: TimingSection,
  fit: TapFitResult
): Map<number, number> {
  const tappedAt = new Map<number, number>();
  if (part.snap !== "taps" || part.taps.length === 0) return tappedAt;
  for (const label of fit.labels) {
    if (label.position !== null) {
      tappedAt.set(label.position, label.seconds + part.offsetSeconds);
    }
  }
  return tappedAt;
}

/**
 * Where a part draws each landing before any drag: on its grid, or snapped
 * to `tappedAt`. Inside the tapped run a missed landing sits between its
 * tapped neighbours in proportion to beats; outside it the grid continues
 * from the nearest tap, so the ends do not jump.
 */
function snappedLandings(
  part: TimingSection,
  fit: TapFitResult,
  clock: BeatClock,
  tappedAt: ReadonlyMap<number, number>
): (position: number) => number {
  const spb = fit.secondsPerBeat;
  const tapped = [...tappedAt.keys()].sort((left, right) => left - right);
  return (position) => {
    const beats = clock.beatsBefore(position);
    if (tapped.length === 0) {
      return fit.originSeconds + spb * beats + part.offsetSeconds;
    }
    const exact = tappedAt.get(position);
    if (exact !== undefined) return exact;
    const after = tapped.find((candidate) => candidate > position);
    const before = [...tapped]
      .reverse()
      .find((candidate) => candidate < position);
    if (before !== undefined && after !== undefined) {
      const fromBeats = clock.beatsBefore(before);
      const share =
        (beats - fromBeats) / (clock.beatsBefore(after) - fromBeats);
      return (
        tappedAt.get(before)! +
        (tappedAt.get(after)! - tappedAt.get(before)!) * share
      );
    }
    const nearest = (before ?? after)!;
    return tappedAt.get(nearest)! + spb * (beats - clock.beatsBefore(nearest));
  };
}

/**
 * Where the performance of parts sharing one count ends: at the latest end
 * Austen set; else where their taps say, rounded up to the end of the pass
 * when close; else at the latest end a split carried; else nowhere, so it
 * runs on. Every part's taps decide, so a part without taps holds where the
 * parts around it stopped.
 */
function chainEnd(
  parts: readonly TimingSection[],
  fits: readonly TapFitResult[],
  movesPerPass: number
): { end: number | null; stored: boolean } {
  const latest = (has: (part: TimingSection) => boolean) =>
    [...parts].reverse().find(has);
  const set = latest((part) => part.lastPosition !== undefined);
  if (set) return { end: set.lastPosition!, stored: true };
  const matched = parts.flatMap((part, index) =>
    part.taps.length === 0
      ? []
      : fits[index]!.labels.flatMap((label) =>
          label.position === null ? [] : [label.position]
        )
  );
  if (matched.length > 0) {
    const dragged = parts.flatMap((part) =>
      part.overrides.map((override) => override.position)
    );
    return {
      end: roundUpToPassEnd(Math.max(...matched, ...dragged), movesPerPass),
      stored: false,
    };
  }
  const carried = latest((part) => part.carriedEnd !== undefined);
  return carried
    ? { end: carried.carriedEnd!, stored: true }
    : { end: null, stored: false };
}

interface ChainDrawing {
  fits: TapFitResult[];
  /** Every landing the parts draw, in position order. */
  table: ResolvedLanding[];
  /**
   * Per part: the positions it draws, and its last landing when the
   * performance ends inside it or before it; null while it runs on.
   */
  spans: { first: number; last: number; end: number | null }[];
  /** True when a stored end decides where the performance ends. */
  stored: boolean;
  /** Positions whose drag was set aside for crowding a neighbour. */
  dropped: Set<number>;
}

/**
 * Draws parts that share one count - one performance, cut only to change
 * tempo - as one, so every part draws each landing alike. `parts` are in
 * take order and each has a fit.
 *
 * Each part draws its grid, snapped to its taps and, when snapped, to the
 * nearest tapped landing either side from the other parts, so the move a
 * cut falls in runs between the same two taps. A drag belongs to the part it
 * was dropped in, but every part draws it; where two dragged one landing,
 * the nearer part's stands (ties: the earlier part). A landing is where the
 * first part to draw it before its cut draws it, else where the last part
 * does: a move that lands after a cut runs at the tempo after it, on both
 * sides of the cut.
 */
function drawChain(
  parts: readonly TimingSection[],
  moveBeats: readonly number[]
): ChainDrawing {
  const clock = createBeatClock(moveBeats);
  const fits = parts.map((part) => fitSection(part, moveBeats)!);
  const views = parts.map((part, index) => {
    const tappedAt = tappedLandings(part, fits[index]!);
    if (part.snap === "taps") {
      const own = [...tappedAt.keys()];
      const edgeBefore = edgeTap(
        parts.slice(0, index).reverse(),
        moveBeats,
        (drawn) =>
          [...drawn]
            .reverse()
            .find((landing) => landing.seconds < part.startSeconds)
      );
      const edgeAfter = edgeTap(parts.slice(index + 1), moveBeats, (drawn) =>
        drawn.find((landing) => landing.seconds >= part.endSeconds)
      );
      if (edgeBefore && own.every((position) => edgeBefore.position < position)) {
        tappedAt.set(edgeBefore.position, edgeBefore.seconds);
      }
      if (edgeAfter && own.every((position) => edgeAfter.position > position)) {
        tappedAt.set(edgeAfter.position, edgeAfter.seconds);
      }
    }
    const drags = new Map(
      part.overrides.map((override) => [override.position, override.seconds])
    );
    for (let distance = 1; distance < parts.length; distance += 1) {
      for (const other of [parts[index - distance], parts[index + distance]]) {
        for (const override of other?.overrides ?? []) {
          if (!drags.has(override.position)) {
            drags.set(override.position, override.seconds);
          }
        }
      }
    }
    return {
      snappedAt: snappedLandings(part, fits[index]!, clock, tappedAt),
      drags,
    };
  });
  const drawnAt = (
    position: number,
    dragged = true
  ): { seconds: number; pinned: boolean } => {
    for (let index = 0; ; index += 1) {
      const view = views[index]!;
      const drag = dragged ? view.drags.get(position) : undefined;
      const seconds = drag ?? view.snappedAt(position);
      if (index === views.length - 1 || seconds < parts[index]!.endSeconds) {
        return { seconds, pinned: drag !== undefined };
      }
    }
  };
  const landingAt = (position: number) => drawnAt(position).seconds;

  // Every position whose landing could matter to a part: from the last
  // landing at or before its start (never below the opening pose) to where
  // the performance ends, or while it runs on, to the part's cut. A part
  // before the one the performance ends in runs on to its cut.
  const { end, stored } = chainEnd(parts, fits, clock.movesPerPass);
  const spans = parts.map((part, index) => {
    const fit = fits[index]!;
    let first = Math.max(
      0,
      clock.nearestPosition(
        (part.startSeconds - part.offsetSeconds - fit.originSeconds) /
          fit.secondsPerBeat
      ) - 1
    );
    while (first > 0 && landingAt(first) > part.startSeconds) first -= 1;
    const partEnd =
      end !== null &&
      (index === parts.length - 1 || landingAt(end) < part.endSeconds)
        ? end
        : null;
    // The performer stopped before this part began, so every layer holds
    // that pose throughout it.
    if (partEnd !== null && partEnd <= first) first = Math.max(0, partEnd - 1);
    let last = first + 1;
    if (partEnd === null) {
      while (landingAt(last) < part.endSeconds) last += 1;
    } else {
      last = Math.max(last, partEnd);
    }
    return { first, last, end: partEnd === null ? null : last };
  });

  const from = Math.min(...spans.map((span) => span.first));
  const to = Math.max(...spans.map((span) => span.last));
  const table: ResolvedLanding[] = [];
  for (let position = from; position <= to; position += 1) {
    table.push({ position, ...drawnAt(position) });
  }
  // A dragged landing that no longer sits between its neighbours would make
  // the moves around it flash by; it goes back to where it is drawn
  // undragged. That spot can crowd a neighbour already checked, so this
  // repeats until every drag left standing has room.
  const dropped = new Set<number>();
  let settled = false;
  while (!settled) {
    settled = true;
    table.forEach((landing, index) => {
      if (!landing.pinned) return;
      const previous = table[index - 1];
      const next = table[index + 1];
      if (
        (previous && landing.seconds < previous.seconds + MIN_MOVE_SECONDS) ||
        (next && landing.seconds > next.seconds - MIN_MOVE_SECONDS)
      ) {
        landing.seconds = drawnAt(landing.position, false).seconds;
        landing.pinned = false;
        dropped.add(landing.position);
        settled = false;
      }
    });
  }
  enforceIncreasing(table);
  return { fits, table, spans, stored, dropped };
}

/**
 * Every landing that matters to a section, or null with nothing to fit.
 * `following` and `preceding` hold the parts after and before it in take
 * order. Parts a "keep counting" split cut apart share one count and are
 * drawn as one (see `drawChain`), so both sides of a cut show the same moves
 * and the same end.
 */
function sectionLandings(
  section: TimingSection,
  moveBeats: readonly number[],
  following: readonly TimingSection[],
  preceding: readonly TimingSection[] = []
): SectionLandings | null {
  const fit = fitSection(section, moveBeats);
  if (!fit) return null;
  const { before, after } = countingChain(
    section,
    preceding,
    following,
    moveBeats
  );
  const self = before.length;
  const drawing = drawChain(
    [...before.reverse(), section, ...after],
    moveBeats
  );
  const span = drawing.spans[self]!;
  const from = drawing.table[0]!.position;
  return {
    fit,
    landings: drawing.table.slice(span.first - from, span.last - from + 1),
    table: drawing.table,
    endPosition: span.end,
    endStored: drawing.stored && span.end !== null,
    droppedOverrides: section.overrides
      .map((override) => override.position)
      .filter((position) => drawing.dropped.has(position))
      .sort((left, right) => left - right),
  };
}

function resolveSection(
  section: TimingSection,
  following: readonly TimingSection[],
  preceding: readonly TimingSection[],
  moveBeats: readonly number[],
  context: { sequenceId: string; takeKey: string; updatedAt: number }
): ResolvedTimingSection {
  const previous = preceding[preceding.length - 1];
  const empty: ResolvedTimingSection = {
    id: section.id,
    startSeconds: section.startSeconds,
    endSeconds: section.endSeconds,
    landingHoldRatio: section.landingHoldRatio ?? 0,
    map: null,
    fit: null,
    landings: [],
    endPosition: null,
    endStored: false,
    droppedOverrides: [],
    countsWithPrevious:
      previous !== undefined && keepsCount(previous, section, moveBeats),
  };
  const resolved = sectionLandings(section, moveBeats, following, preceding);
  if (!resolved) return empty;
  const { fit, landings } = resolved;
  // Nothing left to map still leaves an end Austen can clear.
  const unmapped = { ...empty, fit, endStored: resolved.endStored };

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
    return unmapped;
  }
  if (anchors.length < 2) return unmapped;

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
    endStored: resolved.endStored,
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
    sections: timing.sections.map((section, index) =>
      resolveSection(
        section,
        timing.sections.slice(index + 1),
        timing.sections.slice(0, index),
        moveBeats,
        {
          sequenceId: timing.sequenceId,
          takeKey: timing.takeKey,
          updatedAt: timing.updatedAt,
        }
      )
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

export interface TakeSampleOptions {
  /**
   * Before the section's first landing, keep its opening tempo running back
   * in time instead of holding the opening pose: the arrival goes negative
   * and reaches 0 on beat one. A tunnel over the footage before beat one
   * counts down into it this way.
   */
  leadIn?: boolean;
}

/**
 * The take at a media time, or null when nothing is mapped. Between sections
 * the earlier section holds its last pose; before the first mapped section
 * the first one holds its opening.
 */
export function takeSampleAt(
  resolved: ResolvedTakeTiming,
  mediaSeconds: number,
  options: TakeSampleOptions = {}
): TakeSample | null {
  const mapped = resolved.sections.filter((section) => section.map);
  if (mapped.length === 0) return null;
  let chosen = mapped[0]!;
  for (const section of mapped) {
    if (mediaSeconds >= section.startSeconds) chosen = section;
  }
  const lead = options.leadIn
    ? leadInPosition(chosen.map!, mediaSeconds)
    : null;
  const clamped = Math.min(
    chosen.endSeconds,
    Math.max(chosen.startSeconds, mediaSeconds)
  );
  return {
    arrival: holdAfterLanding(
      lead ?? mediaTimeToSequencePosition(chosen.map!, clamped),
      chosen.landingHoldRatio
    ),
    endArrival: chosen.endPosition,
  };
}

/** The first interval's tempo carried back before a map's first anchor; null from it on. */
function leadInPosition(
  map: SequenceTimeMap,
  mediaSeconds: number
): number | null {
  const [first, second] = map.anchors;
  if (!first || !second || mediaSeconds >= first.mediaTimeSeconds) return null;
  const span = second.mediaTimeSeconds - first.mediaTimeSeconds;
  if (span <= 0) return null;
  const perSecond = (second.sequencePosition - first.sequencePosition) / span;
  return (
    first.sequencePosition - (first.mediaTimeSeconds - mediaSeconds) * perSecond
  );
}

/** Hold the previous complete arrival, then use the rest of the interval to reach the next. */
function holdAfterLanding(arrival: number, ratio: number): number {
  if (ratio === 0 || !Number.isFinite(arrival)) return arrival;
  const previous = Math.floor(arrival);
  const progress = arrival - previous;
  if (progress <= ratio) return previous;
  return previous + (progress - ratio) / (1 - ratio);
}

export function takePositionAt(
  resolved: ResolvedTakeTiming,
  mediaSeconds: number
): number | null {
  return takeSampleAt(resolved, mediaSeconds)?.arrival ?? null;
}

/**
 * The media times either side of `mediaSeconds` at which the take lands back
 * on its opening pose (a whole number of passes), read from the section in
 * effect there. Either is null where the section's map does not reach it.
 */
export function takePassStartsAround(
  resolved: ResolvedTakeTiming,
  mediaSeconds: number
): { earlier: number | null; later: number | null } {
  const mapped = resolved.sections.filter((section) => section.map);
  const passLength = resolved.movesPerPass;
  if (mapped.length === 0 || passLength <= 0) {
    return { earlier: null, later: null };
  }
  let chosen = mapped[0]!;
  for (const section of mapped) {
    if (mediaSeconds >= section.startSeconds) chosen = section;
  }
  const map = chosen.map!;
  const position = mediaTimeToSequencePosition(map, mediaSeconds);
  const at = (passStart: number): number | null => {
    const seconds = sequencePositionToMediaTime(map, passStart);
    // The map holds its ends past its anchors, so a pass start it never
    // reaches would come back as the nearest anchor's time.
    return seconds >= chosen.startSeconds - 1e-6 &&
      seconds <= chosen.endSeconds + 1e-6 &&
      Math.abs(mediaTimeToSequencePosition(map, seconds) - passStart) < 1e-6
      ? seconds
      : null;
  };
  return {
    earlier: at(Math.floor(position / passLength + 1e-9) * passLength),
    later: at(Math.ceil(position / passLength - 1e-9) * passLength),
  };
}

/** True when every section has a fitted grid. */
export function isTakeTimingMapped(resolved: ResolvedTakeTiming): boolean {
  return resolved.sections.every((section) => section.map !== null);
}

/** Identifies a sequence's move lengths, so a changed sequence is noticed. */
export function takeTimingMovesKey(moveBeats: readonly number[]): string {
  return `beats:${moveBeats.join(",")}`;
}

/** The move lengths a timing was checked against, or null when it never was. */
export function takeTimingMoveBeats(timing: TakeTiming): number[] | null {
  const key = timing.movesKey;
  if (!key?.startsWith("beats:")) return null;
  const beats = key.slice("beats:".length).split(",").map(Number);
  return beats.length > 0 &&
    beats.every((beat) => Number.isFinite(beat) && beat > 0)
    ? beats
    : null;
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
      section.taps.length > 0 || section.beatOneSeconds !== undefined
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

/** Whether an edit changed how a part counts its landings. */
function countChanged(was: TimingSection, now: TimingSection): boolean {
  return (
    was.tempo !== now.tempo ||
    was.bpm !== now.bpm ||
    was.firstTapPosition !== now.firstTapPosition ||
    was.beatOneSeconds !== now.beatOneSeconds ||
    was.beatOnePosition !== now.beatOnePosition ||
    was.offsetSeconds !== now.offsetSeconds ||
    was.taps.length !== now.taps.length ||
    was.taps.some((tap, index) => tap !== now.taps[index])
  );
}

/**
 * Applies an edit to one part of a take. An edit to how the part counts -
 * its tempo, taps, beat 1 or nudge - is carried to the parts after it that
 * keep its count, so they count on from it as it now is.
 */
export function editTakeSection(
  timing: TakeTiming,
  sectionId: string,
  moveBeats: readonly number[],
  edit: (section: TimingSection) => TimingSection
): TakeTiming {
  const index = timing.sections.findIndex(
    (section) => section.id === sectionId
  );
  if (index < 0) return timing;
  const original = timing.sections[index]!;
  const section = edit(original);
  if (section === original) return timing;
  const sections = [...timing.sections];
  sections[index] = section;
  if (countChanged(original, section)) {
    recountChain(sections, index + 1, original, moveBeats, null);
  }
  return { ...timing, sections };
}

/**
 * The landing nearest a media time under the section's current fit. Before
 * the opening pose the grid carries on backwards a pass at a time, so beat 1
 * can move to a moment ahead of every tap.
 */
function landingNear(
  section: TimingSection,
  fit: TapFitResult,
  clock: BeatClock,
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
 * The section counted `shift` landings on. Dragged landings and the
 * performance's end are physical moments, so they keep their moments and
 * take the new numbers with them; any that would fall before the opening
 * pose go.
 */
function renumberSection(section: TimingSection, shift: number): TimingSection {
  const { lastPosition, carriedEnd, ...rest } = section;
  const end = lastPosition === undefined ? undefined : lastPosition + shift;
  const carried = carriedEnd === undefined ? undefined : carriedEnd + shift;
  return {
    ...rest,
    overrides: section.overrides
      .map((override) => ({ ...override, position: override.position + shift }))
      .filter((override) => override.position >= 0),
    ...(end !== undefined && end >= 0 ? { lastPosition: end } : {}),
    ...(carried !== undefined && carried >= 0 ? { carriedEnd: carried } : {}),
  };
}

/** A beat-1 edit, and the shift it added to every landing's number. */
interface Recounted {
  section: TimingSection;
  shift: number;
}

function beatOneAt(
  section: TimingSection,
  moveBeats: readonly number[],
  seconds: number
): Recounted {
  const { beatOnePosition: _carriedCount, ...unmarked } = section;
  const fit = fitSection(section, moveBeats);
  // Marks are raw, like taps; the nudge draws them.
  if (!fit) {
    return {
      section: { ...unmarked, beatOneSeconds: seconds - section.offsetSeconds },
      shift: 0,
    };
  }
  const clock = createBeatClock(moveBeats);
  const current = landingNear(section, fit, clock, seconds);
  return {
    section: {
      ...renumberSection(unmarked, 1 - current),
      // Stored on the landing itself, the middle of its catch, so later taps
      // that nudge the grid cannot tip it onto a neighbour.
      beatOneSeconds:
        fit.originSeconds + fit.secondsPerBeat * clock.beatsBefore(current),
    },
    shift: 1 - current,
  };
}

function beatOneMoved(
  section: TimingSection,
  moveBeats: readonly number[],
  landings: number
): Recounted {
  const fit = fitSection(section, moveBeats);
  if (!fit || landings === 0) return { section, shift: 0 };
  // A count carried across a split keeps its mark at the cut and takes the
  // new number there. Marking move 1 instead would put the mark back near
  // the take's start, so a tempo change would pivot far from this part.
  const carried = section.beatOnePosition;
  if (
    carried !== undefined &&
    section.beatOneSeconds !== undefined &&
    carried - landings >= 1
  ) {
    const { beatOnePosition: _count, ...unmarked } = renumberSection(
      section,
      -landings
    );
    return {
      section:
        carried - landings === 1
          ? unmarked
          : { ...unmarked, beatOnePosition: carried - landings },
      shift: -landings,
    };
  }
  const clock = createBeatClock(moveBeats);
  return beatOneAt(
    section,
    moveBeats,
    fit.originSeconds +
      fit.secondsPerBeat * clock.beatsBefore(1 + landings) +
      section.offsetSeconds
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
  return beatOneAt(section, moveBeats, seconds).section;
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
  return beatOneMoved(section, moveBeats, landings).section;
}

/**
 * A part with no beat-1 mark that keeps an earlier part's count, renumbered
 * with it.
 */
function countShifted(section: TimingSection, shift: number): TimingSection {
  return {
    ...renumberSection(section, shift),
    firstTapPosition: Math.max(0, section.firstTapPosition + shift),
  };
}

/**
 * A part that kept `before`'s count, counting on from `after` instead: the
 * same part recounted, or the one that took its place. Its beat 1 moves to
 * the landing of `after` that sits where it sat beside the cut - a mark a
 * nudge left a landing off the cut stays a landing off - under that number
 * less any the part's own count set back (a pause after the cut), never
 * below move 1. With nothing fitted before, as when a part that started over
 * is first tapped, the part's own grid says where its mark sits. A part
 * saved before splits marked the cut is marked at its first counted tap.
 * Moves of different lengths do not number alike across a new count, so no
 * single shift would do. Drags and the end keep their moments and take the
 * numbers found there; an end carried from the taps is guessed again from
 * the new count. Null when the part keeps a count of its own or either side
 * has nothing to count.
 */
function reanchor(
  part: TimingSection,
  before: TimingSection,
  after: TimingSection,
  moveBeats: readonly number[]
): TimingSection | null {
  const partFit = fitSection(part, moveBeats);
  const fitAfter = fitSection(after, moveBeats);
  if (!partFit || !fitAfter) return null;
  const fitBefore = fitSection(before, moveBeats);
  const clock = createBeatClock(moveBeats);
  let landing: number;
  let skipped = 0;
  if (part.beatOneSeconds !== undefined) {
    const mark = part.beatOnePosition ?? 1;
    const marked = fitBefore
      ? landingNear(
          before,
          fitBefore,
          clock,
          part.beatOneSeconds + part.offsetSeconds
        )
      : mark;
    const atCut = Math.max(
      1,
      fitBefore
        ? landingNear(before, fitBefore, clock, part.startSeconds)
        : landingNear(part, partFit, clock, part.startSeconds)
    );
    // A mark further from the cut was placed by hand: a count of its own.
    const fromCut = marked - atCut;
    if (Math.abs(fromCut) > 1) return null;
    skipped = mark - marked;
    landing = Math.max(
      landingNear(after, fitAfter, clock, part.startSeconds) + fromCut,
      1 - skipped
    );
  } else {
    const counted = firstCounted(part, moveBeats);
    if (
      !counted ||
      !fitBefore ||
      landingNear(before, fitBefore, clock, counted.seconds) !==
        counted.position
    ) {
      return null;
    }
    landing = Math.max(1, landingNear(after, fitAfter, clock, counted.seconds));
  }
  const count = landing + skipped;
  const {
    beatOnePosition: _count,
    lastPosition: _end,
    carriedEnd: _carriedEnd,
    ...unmarked
  } = part;
  const recounted: TimingSection = {
    ...unmarked,
    beatOneSeconds:
      fitAfter.originSeconds +
      fitAfter.secondsPerBeat * clock.beatsBefore(landing) +
      after.offsetSeconds -
      part.offsetSeconds,
    ...(count !== 1 ? { beatOnePosition: count } : {}),
    // With no taps the part ran on the grid it was cut from, so it runs on
    // the one it now counts from.
    ...(fitBefore &&
    part.taps.length === 0 &&
    Math.abs(part.bpm - 60 / fitBefore.secondsPerBeat) < 1e-6
      ? { bpm: 60 / fitAfter.secondsPerBeat }
      : {}),
  };
  const toRecounted = joinedPositions(recounted, part, moveBeats);
  if (!toRecounted) return null;
  const taken = new Set<number>();
  const overrides: TimingOverride[] = [];
  for (const override of part.overrides) {
    const position = toRecounted(override.position);
    if (position < 0 || taken.has(position)) continue;
    taken.add(position);
    overrides.push({ ...override, position });
  }
  const end =
    part.lastPosition === undefined
      ? undefined
      : toRecounted(part.lastPosition);
  const guessed =
    part.carriedEnd === undefined ? null : ownEnd(after, moveBeats);
  const carriedEnd = guessed === null ? undefined : guessed + skipped;
  return {
    ...recounted,
    overrides: overrides.sort((left, right) => left.position - right.position),
    ...(end !== undefined && end >= 0 ? { lastPosition: end } : {}),
    ...(carriedEnd !== undefined && carriedEnd >= 0 ? { carriedEnd } : {}),
  };
}

/**
 * The parts from `index` on that kept the count of `before` - the part
 * before them as it was - count on from that part as it is now, down the
 * chain. An unmarked part takes `shift`, the change in every landing's
 * number, when there is one; any other re-anchors (see `reanchor`).
 */
function recountChain(
  sections: TimingSection[],
  index: number,
  before: TimingSection,
  moveBeats: readonly number[],
  shift: number | null
): void {
  let was = before;
  for (
    let at = index;
    at < sections.length && sections[at - 1]!.continuesIntoNext;
    at += 1
  ) {
    const part = sections[at]!;
    const recounted =
      part.beatOneSeconds === undefined && shift
        ? countShifted(part, shift)
        : reanchor(part, was, sections[at - 1]!, moveBeats);
    if (!recounted) return;
    was = part;
    sections[at] = recounted;
  }
}

/**
 * Applies a beat-1 edit to one part of a take. The parts after it that keep
 * its count are renumbered with it, down the chain: correcting the count
 * before a "keep counting" split must not leave the parts after it a move
 * off, or read as a pause where the performance ran on.
 */
function recount(
  timing: TakeTiming,
  sectionId: string,
  moveBeats: readonly number[],
  edit: (section: TimingSection) => Recounted
): TakeTiming {
  const index = timing.sections.findIndex(
    (section) => section.id === sectionId
  );
  if (index < 0) return timing;
  const original = timing.sections[index]!;
  const { section, shift } = edit(original);
  if (section === original) return timing;
  const sections = [...timing.sections];
  sections[index] = section;
  recountChain(sections, index + 1, original, moveBeats, shift);
  return { ...timing, sections };
}

/** `setBeatOneAt` on one part, carried to the parts that keep its count. */
export function setTakeBeatOneAt(
  timing: TakeTiming,
  sectionId: string,
  moveBeats: readonly number[],
  seconds: number
): TakeTiming {
  return recount(timing, sectionId, moveBeats, (section) =>
    beatOneAt(section, moveBeats, seconds)
  );
}

/** `moveBeatOne` on one part, carried to the parts that keep its count. */
export function moveTakeBeatOne(
  timing: TakeTiming,
  sectionId: string,
  moveBeats: readonly number[],
  landings: number
): TakeTiming {
  return recount(timing, sectionId, moveBeats, (section) =>
    beatOneMoved(section, moveBeats, landings)
  );
}

/**
 * Ends the performance at the landing nearest `seconds` as drawn - dragged and
 * snapped to taps - so the end lands on the pose Austen sees there. Past the
 * last drawn landing the grid carries on. `following` and `preceding` hold
 * the parts after and before this one, which decide how a part cut by "keep
 * counting" is drawn.
 */
export function setPerformanceEndAt(
  section: TimingSection,
  moveBeats: readonly number[],
  seconds: number,
  following: readonly TimingSection[] = [],
  preceding: readonly TimingSection[] = []
): TimingSection {
  const fit = fitSection(section, moveBeats);
  if (!fit) return section;
  const clock = createBeatClock(moveBeats);
  const { lastPosition: _end, carriedEnd: _carried, ...open } = section;
  const drawn =
    sectionLandings(open, moveBeats, following, preceding)?.landings ?? [];
  const onGrid = landingNear(section, fit, clock, seconds);
  const lastDrawn = drawn[drawn.length - 1];
  // Up to the last drawn landing, the drawn landings decide: one dragged
  // late sits past its grid slot, and ending on it must not pick the next.
  const nearest =
    lastDrawn &&
    (onGrid <= lastDrawn.position || seconds <= lastDrawn.seconds)
      ? drawn.reduce((best, landing) =>
          Math.abs(landing.seconds - seconds) < Math.abs(best.seconds - seconds)
            ? landing
            : best
        ).position
      : onGrid;
  return { ...open, lastPosition: Math.max(0, nearest) };
}

/**
 * Where a landing can be dragged: strictly between its neighbours, a frame
 * clear of each, as the parts sharing the count draw them, across a cut too.
 * Null when no such landing is drawn. `following` and `preceding` hold the
 * parts around this one, as for `setPerformanceEndAt`.
 */
export function landingDragRange(
  section: TimingSection,
  moveBeats: readonly number[],
  position: number,
  following: readonly TimingSection[] = [],
  preceding: readonly TimingSection[] = []
): { min: number; max: number } | null {
  const resolved = sectionLandings(section, moveBeats, following, preceding);
  const index =
    resolved?.table.findIndex((landing) => landing.position === position) ??
    -1;
  if (!resolved || index < 0) return null;
  const previous = resolved.table[index - 1];
  const after = resolved.table[index + 1];
  return {
    min: Math.max(0, previous ? previous.seconds + MIN_MOVE_SECONDS : 0),
    max: after ? after.seconds - MIN_MOVE_SECONDS : Number.POSITIVE_INFINITY,
  };
}

/** Pins a landing where Austen dropped it, stopped at its neighbours. */
export function setLandingAt(
  section: TimingSection,
  moveBeats: readonly number[],
  position: number,
  seconds: number,
  following: readonly TimingSection[] = [],
  preceding: readonly TimingSection[] = []
): TimingSection {
  const range = landingDragRange(
    section,
    moveBeats,
    position,
    following,
    preceding
  );
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

/** The part `sectionId` names, with the parts before and after it. */
function partAt(
  timing: TakeTiming,
  sectionId: string
): {
  section: TimingSection;
  preceding: TimingSection[];
  following: TimingSection[];
} | null {
  const index = timing.sections.findIndex(
    (section) => section.id === sectionId
  );
  if (index < 0) return null;
  return {
    section: timing.sections[index]!,
    preceding: timing.sections.slice(0, index),
    following: timing.sections.slice(index + 1),
  };
}

/** The parts that share `sectionId`'s count, in take order. */
function countedWith(
  timing: TakeTiming,
  sectionId: string,
  moveBeats: readonly number[]
): TimingSection[] {
  const part = partAt(timing, sectionId);
  if (!part) return [];
  const { before, after } = countingChain(
    part.section,
    part.preceding,
    part.following,
    moveBeats
  );
  return [...before.reverse(), part.section, ...after];
}

/**
 * Ends the performance at the landing nearest `seconds` as drawn - dragged
 * and snapped to taps - so the end lands on the pose Austen sees there. Past
 * the last drawn landing the grid of the part `seconds` falls in carries on.
 * Parts that share a count share the end: it is stored once, on the part the
 * end landing falls in, and replaces any end the others held.
 */
export function setTakePerformanceEndAt(
  timing: TakeTiming,
  sectionId: string,
  moveBeats: readonly number[],
  seconds: number
): TakeTiming {
  const part = partAt(timing, sectionId);
  if (!part || !fitSection(part.section, moveBeats)) return timing;
  const chain = countedWith(timing, sectionId, moveBeats);
  const open = chain.map(
    ({ lastPosition: _end, carriedEnd: _carried, ...rest }) => rest
  );
  const { fits, table } = drawChain(open, moveBeats);
  const clock = createBeatClock(moveBeats);
  const inside = open.findIndex((candidate) => seconds < candidate.endSeconds);
  const home = inside < 0 ? open.length - 1 : inside;
  const onGrid = landingNear(open[home]!, fits[home]!, clock, seconds);
  const lastDrawn = table[table.length - 1];
  // Up to the last drawn landing, the drawn landings decide: one dragged
  // late sits past its grid slot, and ending on it must not pick the next.
  const nearest =
    lastDrawn &&
    (onGrid <= lastDrawn.position || seconds <= lastDrawn.seconds)
      ? table.reduce((best, landing) =>
          Math.abs(landing.seconds - seconds) < Math.abs(best.seconds - seconds)
            ? landing
            : best
        ).position
      : onGrid;
  const lastPosition = Math.max(0, nearest);
  const moment =
    table.find((landing) => landing.position === lastPosition)?.seconds ??
    fits[home]!.originSeconds +
      fits[home]!.secondsPerBeat * clock.beatsBefore(lastPosition) +
      open[home]!.offsetSeconds;
  const keeper =
    open.find((candidate) => moment < candidate.endSeconds) ??
    open[open.length - 1]!;
  return {
    ...timing,
    sections: timing.sections.map((section) => {
      const index = chain.indexOf(section);
      if (index < 0) return section;
      const stripped = open[index]!;
      return stripped === keeper ? { ...stripped, lastPosition } : stripped;
    }),
  };
}

/**
 * Clears the end Austen set or a split carried, for every part that shares
 * `sectionId`'s count, so their taps say where the performance ends again.
 */
export function clearTakePerformanceEnd(
  timing: TakeTiming,
  sectionId: string,
  moveBeats: readonly number[]
): TakeTiming {
  const chain = countedWith(timing, sectionId, moveBeats);
  const ended = (section: TimingSection) =>
    section.lastPosition !== undefined || section.carriedEnd !== undefined;
  if (!chain.some(ended)) return timing;
  return {
    ...timing,
    sections: timing.sections.map((section) => {
      if (!chain.includes(section) || !ended(section)) return section;
      const { lastPosition: _end, carriedEnd: _carried, ...open } = section;
      return open;
    }),
  };
}

/** `landingDragRange` for one part of a take, among the parts around it. */
export function takeLandingDragRange(
  timing: TakeTiming,
  sectionId: string,
  position: number,
  moveBeats: readonly number[]
): { min: number; max: number } | null {
  const part = partAt(timing, sectionId);
  return part
    ? landingDragRange(
        part.section,
        moveBeats,
        position,
        part.following,
        part.preceding
      )
    : null;
}

/**
 * Pins a landing where Austen dropped it, from whichever part he dragged it
 * in. Parts that share a count draw one another's drags, so the drag goes to
 * the part that draws the landing there - the first whose cut it falls
 * before - and replaces any other part's drag on that landing.
 */
export function placeTakeLanding(
  timing: TakeTiming,
  sectionId: string,
  position: number,
  seconds: number,
  moveBeats: readonly number[]
): TakeTiming {
  const range = takeLandingDragRange(timing, sectionId, position, moveBeats);
  if (!range || range.max < range.min) return timing;
  const placed = Math.min(range.max, Math.max(range.min, seconds));
  const chain = countedWith(timing, sectionId, moveBeats);
  const keeper =
    chain.find((part) => placed < part.endSeconds) ?? chain[chain.length - 1]!;
  return {
    ...timing,
    sections: timing.sections.map((part) => {
      if (!chain.includes(part)) return part;
      const others = part.overrides.filter(
        (override) => override.position !== position
      );
      if (part === keeper) {
        return {
          ...part,
          overrides: [...others, { position, seconds: placed }].sort(
            (left, right) => left.position - right.position
          ),
        };
      }
      return others.length === part.overrides.length
        ? part
        : { ...part, overrides: others };
    }),
  };
}

/**
 * Hands a dragged landing back to the grid, whichever of the parts sharing
 * the count holds the drag.
 */
export function releaseTakeLanding(
  timing: TakeTiming,
  sectionId: string,
  position: number,
  moveBeats: readonly number[]
): TakeTiming {
  const chain = countedWith(timing, sectionId, moveBeats);
  const holds = (part: TimingSection) =>
    part.overrides.some((override) => override.position === position);
  if (!chain.some(holds)) return timing;
  return {
    ...timing,
    sections: timing.sections.map((part) =>
      chain.includes(part) && holds(part)
        ? releaseLanding(part, position)
        : part
    ),
  };
}

/** The middle value, averaging the middle two; the legacy map's own rule. */
function medianOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
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
  if (marks.length === 0) return null;
  if (marks.some((mark, index) => index > 0 && mark <= marks[index - 1]!)) {
    return null;
  }
  // The old maps always closed on one more landing: the end mark when Austen
  // tapped one, otherwise a typical move after the last mark, never past the
  // end of the file. Dropping it would lose the last move.
  const lastMark = marks[marks.length - 1]!;
  const markedEnd =
    input.endMark !== undefined &&
    Number.isFinite(input.endMark) &&
    input.endMark > lastMark
      ? input.endMark
      : undefined;
  // The opening pose alone says nothing about when anything lands.
  if (marks.length < 2 && markedEnd === undefined) return null;
  const closingEnd = Math.min(
    input.durationSeconds,
    markedEnd ??
      lastMark +
        (medianOf(marks.slice(1).map((mark, index) => mark - marks[index]!)) ??
          input.durationSeconds - lastMark)
  );
  if (closingEnd > lastMark) marks.push(closingEnd);
  if (marks.length < 2) return null;
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
