/**
 * How far a slow card's mandala is drawn while its picture loads (Austen,
 * 2026-11-12: "the whole point of this was to make it so that the loading
 * process actually is reflected by the mandala's drawing of itself").
 *
 * The drawing is the card's progress bar: it is never complete before the
 * picture is ready, and never still while the card loads. With no step
 * numbers it opens quickly and then keeps a steady pace a reader can see
 * (openingPoints). Step numbers carry it from wherever it was to
 * NUMBERS_CEILING. After the last step it creeps on toward WAIT_CEILING until
 * the picture arrives, and only then finishes.
 *
 * A stretch of drawing is a list of points in time, which the overlay plays
 * as one Web Animation (no frame loop: the main thread is busy rendering
 * cards during exactly this window) and reads back with fractionAt.
 */

/** A drawn fraction (0 to 1) at a time in ms since the stretch began. */
export interface DrawPoint {
  at: number;
  d: number;
}

/** Where the last step number leaves the drawing. */
export const NUMBERS_CEILING = 0.9;
/** Where the creep heads once the steps are done and the picture is not. */
export const WAIT_CEILING = 0.97;
/** How much of the next step's share the drawing creeps into between steps. */
export const STEP_REST_SHARE = 0.8;

/** The quick ink a card opens with, and how soon most of it is down. */
const OPENING_REACH = 0.3;
const OPENING_MS = 600;
/** The steady pace after it, up to NUMBERS_CEILING: 3% of the line a second. */
const STEADY_PER_MS = 0.03 / 1000;
/** The pace past NUMBERS_CEILING, up to WAIT_CEILING. */
const LATE_PER_MS = 0.01 / 1000;

/** The creep covers half its distance in this long. */
const CREEP_HALF_MS = 1200;
/** How long a creep is laid out for; a card stuck past this holds its line. */
const CREEP_SPAN_MS = 60_000;
const CREEP_SAMPLES = 24;
const EASE_SAMPLES = 6;

/** The drawn fraction `ms` into a wait with no step numbers. */
export function openingFraction(ms: number): number {
  const steady =
    OPENING_REACH * (1 - Math.exp(-ms / OPENING_MS)) + STEADY_PER_MS * ms;
  if (steady <= NUMBERS_CEILING) return steady;
  const capAt = (NUMBERS_CEILING - OPENING_REACH) / STEADY_PER_MS;
  return Math.min(WAIT_CEILING, NUMBERS_CEILING + LATE_PER_MS * (ms - capAt));
}

/**
 * A card with no step numbers, from an empty drawing: quick ink first, then
 * a steady 3% of the line a second. A creep that kept slowing looked frozen
 * from about five seconds on (the line's tip moved under 10 px a second),
 * and this is the wait most cards have: a picture kept in the cloud reports
 * no steps while it downloads. Past NUMBERS_CEILING it slows to 1% a second
 * and holds at WAIT_CEILING.
 */
export function openingPoints(): DrawPoint[] {
  const points: DrawPoint[] = [];
  // The quick start bends, so it is sampled closely; the steady line after
  // it needs only its ends.
  for (let at = 0; at <= 4200; at += at < 1500 ? 100 : 300) {
    points.push({ at, d: openingFraction(at) });
  }
  const capAt = (NUMBERS_CEILING - OPENING_REACH) / STEADY_PER_MS;
  points.push({ at: capAt, d: NUMBERS_CEILING });
  points.push({
    at: capAt + (WAIT_CEILING - NUMBERS_CEILING) / LATE_PER_MS,
    d: WAIT_CEILING,
  });
  return points;
}

/**
 * A creep from `from` toward `ceiling`, for the gaps between step numbers
 * and the wait after the last one: d = from + (ceiling - from) x
 * t / (t + 1.2 s). It never arrives. Sampled at even steps of distance, so
 * the quick early part gets as many points as the long slow tail.
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
 * creep toward `rest` so the line keeps moving until the next number.
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

/** The drawn fraction a step count asks for, counted up from `base`. */
export function numbersTarget(base: number, done: number, of: number): number {
  if (of <= 0) return base;
  const progress = Math.min(1, Math.max(0, done / of));
  return base + Math.max(0, NUMBERS_CEILING - base) * progress;
}

/**
 * How long the last of the drawing takes once the picture is ready. It grows
 * with what is left, so a mostly empty drawing does not lurch to full.
 */
export function finishDuration(
  left: number,
  emphasisMs: number,
  sceneMs: number
): number {
  return Math.min(sceneMs * 0.75, Math.max(emphasisMs, left * sceneMs));
}

/** The drawn fraction `at` ms into a stretch. */
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

/** A stretch as keyframes for a path whose pathLength is 1. */
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
        { strokeDashoffset: 1 - first.d, offset: 0 },
        { strokeDashoffset: 1 - last.d, offset: 1 },
      ],
      duration: 0,
    };
  }
  const keyframes = points.map((point, i) => ({
    strokeDashoffset: 1 - point.d,
    offset: i === points.length - 1 ? 1 : (point.at - first.at) / duration,
  }));
  return { keyframes, duration };
}
