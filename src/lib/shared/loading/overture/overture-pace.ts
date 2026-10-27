/**
 * The Overture's pace: how far the trace has run at a given moment of the
 * boot.
 *
 * The trace aims to cover the mandala at one steady speed over the time this
 * machine's boots usually take (the median of its last few, kept by
 * overture-boot.js). Milestones that land early or late move the expected
 * end, and the speed follows that change gradually instead of jumping, so a
 * late network call slows the pen a little rather than stopping it. Past the
 * expected end it keeps creeping toward the ceiling without reaching it; the
 * finish draws whatever is left.
 *
 * Pure: no worker globals, no clock of its own. Times are ms on the page's
 * clock.
 *
 * Design: docs/superpowers/specs/2026-10-26-boot-overture-design.md
 */

/** Where the steady run aims to be when the boot ends. */
export const PACE_TARGET = 0.92;
/** A late boot creeps from the target toward this; the finish draws the rest. */
export const PACE_CEILING = 0.97;
/** Speed changes settle over about this long. */
const SMOOTHING_MS = 600;
/** Past the expected end, the gap to the ceiling closes on this time scale. */
const LATE_MS = 1200;
/** Catching up never runs faster than this multiple of the planned speed. */
const MAX_SPEEDUP = 1.8;
/** A frame gap longer than this (a hidden tab, a stalled worker) counts as this. */
const MAX_STEP_MS = 100;
const FINISH_MIN_MS = 120;
const FINISH_MAX_MS = 300;

/** The default boot length when nothing was learned: the boot's own default profile's `composed`. */
export const DEFAULT_BOOT_MS = 6380;
/** Boots remembered for the median. */
export const PACE_SAMPLES = 5;

export interface PaceProfile {
  t: Record<string, number>;
}

export interface OverturePacer {
  /** The traced fraction at `now`; never goes back. */
  at(now: number): number;
  /** A milestone arrived at `at`: move the expected end by how early or late it was. */
  milestone(name: string, at: number): void;
  /** When the boot is expected to end now. */
  end(): number;
  /** How long the finish takes to trace the rest from `from`. */
  finishMs(from: number): number;
}

/** The profile's end: `composed`, else `ready`. */
function profileEnd(profile: PaceProfile | null): number | null {
  const t = profile?.t;
  if (!t) return null;
  const end = t.composed ?? t.ready;
  return typeof end === "number" && end > 0 ? end : null;
}

/** The expected boot length: the learned median, else the profile's end, else the default. */
export function expectedBootMs(
  learned: number | null,
  profile: PaceProfile | null
): number {
  if (typeof learned === "number" && learned > 0) return learned;
  return profileEnd(profile) ?? DEFAULT_BOOT_MS;
}

/** The median of the stored boot lengths, or null when none are usable. */
export function medianBootMs(samples: unknown): number | null {
  if (!Array.isArray(samples)) return null;
  const ms = samples
    .filter((n): n is number => typeof n === "number" && n > 0)
    .sort((a, b) => a - b);
  if (!ms.length) return null;
  const mid = ms.length >> 1;
  return ms.length % 2 ? ms[mid]! : (ms[mid - 1]! + ms[mid]!) / 2;
}

/** The stored samples with a new boot length added, newest last, at most PACE_SAMPLES. */
export function addBootSample(samples: unknown, ms: number): number[] {
  const kept = Array.isArray(samples)
    ? samples.filter((n): n is number => typeof n === "number" && n > 0)
    : [];
  kept.push(Math.round(ms));
  return kept.slice(-PACE_SAMPLES);
}

export function createOverturePacer(options: {
  /** When the trace starts. */
  start: number;
  /** The expected boot length (see expectedBootMs). */
  expected: number;
  /** The capsule's profile, whose milestone times say how far along each arrival is. */
  profile: PaceProfile | null;
}): OverturePacer {
  const expected = options.expected;
  // The profile's milestones, scaled to this machine's expected length.
  const scale = expected / (profileEnd(options.profile) ?? expected);
  const due: Record<string, number> = {};
  for (const [name, t] of Object.entries(options.profile?.t ?? {})) {
    if (typeof t === "number") due[name] = t * scale;
  }
  // The speed that covers the run in the expected time, from the start.
  const planned = PACE_TARGET / Math.max(1000, expected - options.start);
  // The latest arrival so far: everything due before the trace started
  // counts as on time.
  let anchorDue = options.start;
  let anchorAt = options.start;
  let p = 0;
  let speed = planned; // fraction per ms; the canvas fades in, so start moving
  let last = options.start;

  // When the boot should end, seen at `now`: late by as much as the latest
  // arrival was, and by as long as the next milestone is overdue, so a slow
  // step slows the pen while it is slow, not all at once when it ends.
  function endAt(now: number): number {
    const late = anchorAt - anchorDue;
    let next = Infinity;
    for (const name in due) {
      if (due[name]! > anchorDue && due[name]! < next) next = due[name]!;
    }
    const overdue = next === Infinity ? 0 : Math.max(0, now - (next + late));
    return Math.max(anchorAt + 200, expected + late + overdue);
  }

  return {
    at(now) {
      const dt = Math.min(MAX_STEP_MS, Math.max(0, now - last));
      last = Math.max(last, now);
      if (dt === 0) return p;
      const end = endAt(now);
      // On plan this stays constant: the gap and the time left shrink together.
      // Ahead of the target, or past the end, creep toward the ceiling.
      const wanted =
        now < end && p < PACE_TARGET
          ? Math.min(planned * MAX_SPEEDUP, (PACE_TARGET - p) / (end - now))
          : (PACE_CEILING - p) / LATE_MS;
      speed += (wanted - speed) * (1 - Math.exp(-dt / SMOOTHING_MS));
      p = Math.min(PACE_CEILING, p + speed * dt);
      return p;
    },
    milestone(name, at) {
      const d = due[name];
      // Unknown to the profile, or an earlier step arriving out of order.
      if (d === undefined || d < anchorDue) return;
      anchorDue = d;
      anchorAt = at;
    },
    end: () => endAt(last),
    finishMs(from) {
      const left = Math.max(0, 1 - from);
      if (left === 0) return FINISH_MIN_MS;
      const ms = speed > 0 ? left / speed : FINISH_MAX_MS;
      return Math.min(FINISH_MAX_MS, Math.max(FINISH_MIN_MS, ms));
    },
  };
}
