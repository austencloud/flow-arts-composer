import { z } from "zod";

/**
 * Where the lit ends of two LED staffs sit in a filmed take, found once by
 * `staff-tip-analyzer.ts` and saved with the take, so effects can follow the
 * real staffs in the preview and the export.
 *
 * Staff 0 is the blue staff and staff 1 the red one, matching the app's
 * blue = prop 0, red = prop 1. Each staff has two ends, A and B. Which end is
 * A is fixed by the tracker for the whole take, so an effect that keys state
 * per end stays on the same end through spins.
 *
 * Positions are fractions of the picture (0 to 1 across its width and down
 * its height), one sample per `1 / sampleRate` seconds of the take's own
 * media time, so they survive a take being trimmed, slowed or reframed.
 */

export const STAFF_TIP_TRACK_VERSION = 1;

/** The end was not found and not filled in. */
export const TIP_MISSING = 0;
/** The end was measured in its own blob. */
export const TIP_SEEN = 1;
/** The end was hidden for a short gap and filled in from its neighbours. */
export const TIP_FILLED = 2;

export type StaffTipState = typeof TIP_MISSING | typeof TIP_SEEN | typeof TIP_FILLED;

export type StaffColor = "blue" | "red";

/** The staffs in track order: index is the prop index. */
export const STAFF_COLORS: readonly StaffColor[] = ["blue", "red"];

const TipSeriesSchema = z
  .object({
    /** Fraction of the picture's width; -1 where the end is missing. */
    x: z.array(z.number().finite()),
    /** Fraction of the picture's height; -1 where the end is missing. */
    y: z.array(z.number().finite()),
    /** One of TIP_MISSING, TIP_SEEN or TIP_FILLED per sample. */
    state: z.array(z.number().int().min(0).max(2)),
  })
  .strict();

export type StaffTipSeries = z.infer<typeof TipSeriesSchema>;

export const StaffTipTrackSchema = z
  .object({
    version: z.literal(STAFF_TIP_TRACK_VERSION),
    /** The picture the fractions refer to, in the take's own pixels. */
    sourceWidth: z.number().int().positive(),
    sourceHeight: z.number().int().positive(),
    /** Samples per second of media time. */
    sampleRate: z.number().finite().positive(),
    /** Media time of sample 0, in seconds. */
    firstSampleSeconds: z.number().finite().min(0),
    sampleCount: z.number().int().min(0),
    staffs: z
      .array(
        z
          .object({
            color: z.enum(["blue", "red"]),
            ends: z.tuple([TipSeriesSchema, TipSeriesSchema]),
          })
          .strict()
      )
      .length(2),
  })
  .strict()
  .superRefine((track, context) => {
    for (const staff of track.staffs) {
      for (const series of staff.ends) {
        if (
          series.x.length !== track.sampleCount ||
          series.y.length !== track.sampleCount ||
          series.state.length !== track.sampleCount
        ) {
          context.addIssue({
            code: "custom",
            message: "Every end needs one entry per sample",
          });
          return;
        }
      }
    }
  });

export type StaffTipTrack = z.infer<typeof StaffTipTrackSchema>;

/** One end at one moment, as a fraction of the picture. */
export interface StaffTipPoint {
  /** 0 = blue staff, 1 = red staff. */
  staff: number;
  /** 0 = end A, 1 = end B. */
  end: 0 | 1;
  color: StaffColor;
  x: number;
  y: number;
  /** Whether this point came from measured samples on both sides. */
  filled: boolean;
}

/** One point of an end's path through time. */
export interface StaffTipPathPoint {
  x: number;
  y: number;
  /** Media time, in seconds. */
  seconds: number;
}

/** The sample index (fractional) at a media time. */
function sampleAt(track: StaffTipTrack, mediaSeconds: number): number {
  return (mediaSeconds - track.firstSampleSeconds) * track.sampleRate;
}

function present(series: StaffTipSeries, index: number): boolean {
  return series.state[index] !== TIP_MISSING;
}

/**
 * Where one end is at a media time, blended between the two samples around
 * it, or null when either is missing or the time is outside the take.
 */
export function staffTipAt(
  track: StaffTipTrack,
  staff: number,
  end: 0 | 1,
  mediaSeconds: number
): { x: number; y: number; filled: boolean } | null {
  const series = track.staffs[staff]?.ends[end];
  if (!series || track.sampleCount === 0) return null;
  const at = sampleAt(track, mediaSeconds);
  const last = track.sampleCount - 1;
  if (at < -0.5 || at > last + 0.5) return null;
  const clamped = Math.min(last, Math.max(0, at));
  const lower = Math.floor(clamped);
  const upper = Math.min(last, lower + 1);
  if (!present(series, lower) || !present(series, upper)) {
    // Right on a present sample is still a position.
    const nearest = Math.round(clamped);
    if (Math.abs(clamped - nearest) < 1e-6 && present(series, nearest)) {
      return {
        x: series.x[nearest]!,
        y: series.y[nearest]!,
        filled: series.state[nearest] === TIP_FILLED,
      };
    }
    return null;
  }
  const mix = clamped - lower;
  return {
    x: series.x[lower]! + (series.x[upper]! - series.x[lower]!) * mix,
    y: series.y[lower]! + (series.y[upper]! - series.y[lower]!) * mix,
    filled:
      series.state[lower] === TIP_FILLED || series.state[upper] === TIP_FILLED,
  };
}

/** Every end present at a media time. */
export function staffTipsAt(
  track: StaffTipTrack,
  mediaSeconds: number
): StaffTipPoint[] {
  const points: StaffTipPoint[] = [];
  track.staffs.forEach((staff, staffIndex) => {
    for (const end of [0, 1] as const) {
      const point = staffTipAt(track, staffIndex, end, mediaSeconds);
      if (point) {
        points.push({ staff: staffIndex, end, color: staff.color, ...point });
      }
    }
  });
  return points;
}

/**
 * One end's path from `fromSeconds` to `toSeconds`, one point per sample plus
 * the exact end points, split into runs wherever the end goes missing so a
 * trail never draws a line across a gap.
 */
export function staffTipPath(
  track: StaffTipTrack,
  staff: number,
  end: 0 | 1,
  fromSeconds: number,
  toSeconds: number
): StaffTipPathPoint[][] {
  const series = track.staffs[staff]?.ends[end];
  if (!series || track.sampleCount === 0 || toSeconds <= fromSeconds) return [];
  const runs: StaffTipPathPoint[][] = [];
  let run: StaffTipPathPoint[] = [];
  const push = (point: StaffTipPathPoint | null): void => {
    if (point) {
      run.push(point);
    } else if (run.length > 0) {
      runs.push(run);
      run = [];
    }
  };
  const pointAt = (seconds: number): StaffTipPathPoint | null => {
    const tip = staffTipAt(track, staff, end, seconds);
    return tip ? { x: tip.x, y: tip.y, seconds } : null;
  };

  push(pointAt(fromSeconds));
  const first = Math.max(0, Math.floor(sampleAt(track, fromSeconds)) + 1);
  const last = Math.min(track.sampleCount - 1, Math.ceil(sampleAt(track, toSeconds)) - 1);
  for (let index = first; index <= last; index++) {
    const seconds = track.firstSampleSeconds + index / track.sampleRate;
    if (seconds <= fromSeconds || seconds >= toSeconds) continue;
    push(
      present(series, index)
        ? { x: series.x[index]!, y: series.y[index]!, seconds }
        : null
    );
  }
  push(pointAt(toSeconds));
  if (run.length > 0) runs.push(run);
  return runs;
}

/** The share of end-samples that were measured or filled, 0 to 1. */
export function staffTipCoverage(track: StaffTipTrack): number {
  let found = 0;
  let total = 0;
  for (const staff of track.staffs) {
    for (const series of staff.ends) {
      for (const state of series.state) {
        total++;
        if (state !== TIP_MISSING) found++;
      }
    }
  }
  return total === 0 ? 0 : found / total;
}
