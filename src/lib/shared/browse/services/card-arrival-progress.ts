/**
 * How a slow card's mandala shows that its picture is loading (Austen,
 * 2026-11-12: "the whole point of this was to make it so that the loading
 * process actually is reflected by the mandala's drawing of itself"; and
 * 2026-11-14, on cards that drew themselves whole and stopped: "if I didn't
 * know that that was a loading screen, I would just think it's frozen").
 *
 * Every traced path shows one stretch of ink that travels round the path, a
 * lap every LAP_MS, for as long as the card waits. The travel is the sign of
 * life; the stretch's length is the progress. So the figure is never complete
 * before the picture is ready and never still while the card loads, and a
 * card that waits five minutes looks at minute five as it did at second five.
 *
 * - No step numbers (checking, queued, downloading, saving): the stretch opens
 *   quickly to OPENING_REACH and stays that length. Nothing grows on a clock;
 *   a clock that drew most of the figure on a long wait left a finished-
 *   looking mandala that then sat still.
 * - Step numbers carry the length from wherever it is up to NUMBERS_CEILING,
 *   so a gap keeps travelling round the figure. After the last step it stays
 *   at the ceiling until the picture is ready.
 * - Picture ready: the gap closes (finishPoints), then the hand-off.
 *
 * A change of length is a list of points in time, which the overlay plays as
 * one Web Animation on stroke-dasharray and reads back with fractionAt. The
 * travel is a second, endless linear animation on stroke-dashoffset
 * (travelAnimation). No frame loop: the main thread is busy rendering cards
 * during exactly this window.
 */

/** A drawn length (0 to 1 of the path) at a time in ms since the stretch began. */
export interface DrawPoint {
  at: number;
  d: number;
}

/**
 * The longest the stretch gets before the picture is ready. Short of 1 so a
 * visible gap keeps travelling round the figure, which reads as unfinished.
 * 0.85 was too much: on a many-looped mandala the gap hid among the loops
 * and "Loading 99%" sat over what looked like a finished drawing (filmed
 * 2026-11-14 at phone size). At 0.7 the gap shows on every figure.
 */
export const NUMBERS_CEILING = 0.7;
/** How much of the next step's share the stretch creeps into between steps. */
export const STEP_REST_SHARE = 0.8;
/** The length a card opens to, and keeps while it has no step numbers. */
export const OPENING_REACH = 0.3;
/**
 * One lap of the travelling stretch round its path. Slow enough to read as
 * calm waiting, quick enough that the tip moves visibly in any one second on
 * a phone card (round a figure about 110 px across, as on a 170 px card, the
 * tip moves about 50 px a second).
 */
export const LAP_MS = 7000;

/** Most of the opening is down in about this long. */
const OPENING_MS = 600;
/** The creep covers half its distance in this long. */
const CREEP_HALF_MS = 1200;
/** How long a creep is laid out for; past it the length holds and only travels. */
const CREEP_SPAN_MS = 60_000;
const CREEP_SAMPLES = 24;
const EASE_SAMPLES = 6;

/** The stretch's length `ms` into a wait with no step numbers. */
export function openingFraction(ms: number): number {
  return OPENING_REACH * (1 - Math.exp(-Math.max(0, ms) / OPENING_MS));
}

/**
 * A card with no step numbers, from nothing: quick ink first, then the
 * opening length held for as long as the card waits. The bend is sampled
 * closely; the last point lands exactly on OPENING_REACH.
 */
export function openingPoints(): DrawPoint[] {
  const points: DrawPoint[] = [];
  for (let at = 0; at <= 3000; at += 150) {
    points.push({ at, d: openingFraction(at) });
  }
  points.push({ at: 3600, d: OPENING_REACH });
  return points;
}

/**
 * A creep from `from` toward `ceiling`, for the gaps between step numbers:
 * d = from + (ceiling - from) x t / (t + 1.2 s). It never arrives. Sampled at
 * even steps of distance, so the quick early part gets as many points as the
 * long slow tail.
 */
export function creepPoints(
  from: number,
  ceiling: number,
  startAt = 0
): DrawPoint[] {
  const reach = Math.max(0, ceiling - from);
  const last = CREEP_SPAN_MS / (CREEP_SPAN_MS + CREEP_HALF_MS);
  const points: DrawPoint[] = [];
  for (let i = 0; i <= CREEP_SAMPLES; i++) {
    const share = (i / CREEP_SAMPLES) * last;
    points.push({
      at: startAt + (CREEP_HALF_MS * share) / (1 - share),
      d: from + reach * share,
    });
  }
  return points;
}

/**
 * A step number arriving: ease from `from` to `target` over `easeMs`, then
 * creep toward `rest` so the length keeps answering until the next number.
 * With `rest` equal to `target` it eases there and holds.
 */
export function stepPoints(
  from: number,
  target: number,
  rest: number,
  easeMs: number
): DrawPoint[] {
  const points: DrawPoint[] = [];
  if (easeMs > 0) {
    for (let i = 0; i < EASE_SAMPLES; i++) {
      const x = i / EASE_SAMPLES;
      const eased = 1 - (1 - x) ** 3;
      points.push({ at: x * easeMs, d: from + (target - from) * eased });
    }
  }
  return [...points, ...creepPoints(target, Math.max(rest, target), easeMs)];
}

/** The length a step count asks for, counted up from `base` to the ceiling. */
export function numbersTarget(base: number, done: number, of: number): number {
  if (of <= 0) return base;
  const progress = Math.min(1, Math.max(0, done / of));
  const target = base + Math.max(0, NUMBERS_CEILING - base) * progress;
  // Rounding can land a hair past the ceiling; the ceiling is a promise.
  return Math.min(Math.max(base, NUMBERS_CEILING), target);
}

/**
 * The length a drawing shows with no motion at all (reduced motion): the
 * opening length, or as far as the step numbers have carried it. Never whole.
 */
export function stillLength(
  progress: { done: number; of: number } | null
): number {
  if (!progress) return OPENING_REACH;
  return numbersTarget(OPENING_REACH, progress.done, progress.of);
}

/**
 * How long the gap takes to close once the picture is ready. It grows with
 * what is left, so a short stretch does not lurch to full.
 */
export function finishDuration(
  left: number,
  emphasisMs: number,
  sceneMs: number
): number {
  return Math.min(sceneMs * 0.75, Math.max(emphasisMs, left * sceneMs));
}

/** The picture is ready: close the gap from wherever the length is now. */
export function finishPoints(from: number, durationMs: number): DrawPoint[] {
  return [
    { at: 0, d: from },
    { at: Math.max(0, durationMs), d: 1 },
  ];
}

/** The length `at` ms into a stretch. */
export function fractionAt(points: readonly DrawPoint[], at: number): number {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return 0;
  if (at <= first.at) return first.d;
  if (at >= last.at) return last.d;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (at <= b.at) {
      const span = b.at - a.at;
      return span > 0 ? a.d + ((b.d - a.d) * (at - a.at)) / span : b.d;
    }
  }
  return last.d;
}

/** One stretch of ink and the gap after it, on a path whose pathLength is 1. */
export function dashFor(d: number): string {
  const length = Math.min(1, Math.max(0, d));
  return `${length} ${1 - length}`;
}

/** A stretch as stroke-dasharray keyframes for a path whose pathLength is 1. */
export function drawKeyframes(points: readonly DrawPoint[]): {
  keyframes: Keyframe[];
  duration: number;
} {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return { keyframes: [], duration: 0 };
  const duration = last.at - first.at;
  if (duration <= 0) {
    return {
      keyframes: [
        { strokeDasharray: dashFor(first.d), offset: 0 },
        { strokeDasharray: dashFor(last.d), offset: 1 },
      ],
      duration: 0,
    };
  }
  const keyframes = points.map((point, i) => ({
    strokeDasharray: dashFor(point.d),
    offset: i === points.length - 1 ? 1 : (point.at - first.at) / duration,
  }));
  return { keyframes, duration };
}

/**
 * The travel: the dash pattern slides forward along the path one whole
 * period a lap, at an even pace, for ever. It starts at offset 1, which puts
 * the stretch at the path's start, where the opening draws it from.
 */
export function travelAnimation(): {
  keyframes: Keyframe[];
  timing: KeyframeAnimationOptions;
} {
  return {
    keyframes: [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }],
    timing: { duration: LAP_MS, iterations: Infinity, easing: "linear" },
  };
}
