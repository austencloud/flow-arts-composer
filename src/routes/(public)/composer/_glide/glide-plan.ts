/**
 * Stop math for the /composer stage (ComposerGlide.svelte).
 *
 * On a large window the page's sections rest one at a time on a fixed stage.
 * This module turns the page's scroll offset into the section resting there,
 * how far a section taller than the stage has panned, and where a section
 * sits in depth while the camera glides from one to the next. It never
 * touches the DOM, so the stage can be tested without a browser.
 */

/** CSS perspective the stage projects through, in px. */
export const GLIDE_PERSPECTIVE = 1000;
/** Depth the next stop waits at before it arrives, in px. */
export const GLIDE_AHEAD_DEPTH = 180;
/** Depth a stop drifts toward the camera as it is left, in px. */
export const GLIDE_BEHIND_DEPTH = 140;
/** An arriving stop starts to show once it is this close, in stops. */
export const GLIDE_ARRIVE_SHOW = 0.65;
/** An arriving stop is fully clear once it is this close. */
export const GLIDE_ARRIVE_CLEAR = 0.1;
/** A stop left behind has faded out after this much of a glide. */
export const GLIDE_LEAVE_FADE = 0.5;
/** Star depth travelled per glide, in px. */
export const GLIDE_STAR_STEP = 240;

export interface GlidePlanInput {
  /** Layout height of each stop, in page order. */
  readonly heights: readonly number[];
  /** Stage height a resting stop can use before it must pan. */
  readonly room: number;
  /** Scroll distance between one stop's rest and the next. */
  readonly travel: number;
  /** Scroll distance a stop absorbs on either side before a glide starts. */
  readonly hold: number;
}

export interface GlidePlan {
  /** How far each stop pans while it rests; 0 when it fits the stage. */
  readonly pans: readonly number[];
  /** Scroll offset where each stop rests with its top in view. */
  readonly docks: readonly number[];
  readonly travel: number;
  readonly hold: number;
  /** Scroll length of the whole stage. */
  readonly length: number;
}

export interface GlidePose {
  /** translateZ in px; negative is ahead of the camera. */
  readonly z: number;
  readonly opacity: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function planStops({
  heights,
  room,
  travel,
  hold,
}: GlidePlanInput): GlidePlan {
  const pans = heights.map((height) => Math.max(0, Math.ceil(height - room)));
  const docks: number[] = [];
  let cursor = 0;
  pans.forEach((pan, index) => {
    docks.push(cursor);
    cursor += pan + hold;
    if (index < pans.length - 1) cursor += travel;
  });
  return { pans, docks, travel, hold, length: cursor };
}

/**
 * Where a stop sits during a glide, from its place relative to the camera: 0
 * rests in the stage plane, 1 waits one stop ahead, -1 has been left one stop
 * behind. The leaving stop is almost gone before the arriving one shows, so
 * two sections' text never reads at once.
 */
export function glidePose(relative: number): GlidePose {
  const place = clamp(relative, -1, 1);
  if (place >= 0) {
    return {
      z: -place * GLIDE_AHEAD_DEPTH,
      opacity: 1 - smoothstep(GLIDE_ARRIVE_CLEAR, GLIDE_ARRIVE_SHOW, place),
    };
  }
  return {
    z: -place * GLIDE_BEHIND_DEPTH,
    opacity: 1 - smoothstep(0, GLIDE_LEAVE_FADE, -place),
  };
}

/** Scroll offsets that count as resting on stop `index`: its pan, with the
    plan's hold on either side. */
export function restRange(
  plan: GlidePlan,
  index: number
): { start: number; end: number } {
  const dock = plan.docks[index] ?? 0;
  return {
    start: dock - plan.hold,
    end: dock + (plan.pans[index] ?? 0) + plan.hold,
  };
}

/** The stop whose rest range is closest to a scroll offset. */
export function nearestStop(plan: GlidePlan, offset: number): number {
  let nearest = 0;
  let nearestDistance = Infinity;
  plan.docks.forEach((_dock, index) => {
    const { start, end } = restRange(plan, index);
    const distance =
      offset < start ? start - offset : offset > end ? offset - end : 0;
    if (distance < nearestDistance) {
      nearest = index;
      nearestDistance = distance;
    }
  });
  return nearest;
}

/**
 * The stop a scroll away from the current one should glide to: at least the
 * neighbour in the direction of the scroll, further when the scroll went
 * further, as a dragged scrollbar does. Null while the offset still rests on
 * the current stop, and past the last stop, where the page runs on to its
 * footer.
 */
export function glideTarget(
  plan: GlidePlan,
  current: number,
  offset: number
): number | null {
  const { start, end } = restRange(plan, current);
  const last = plan.docks.length - 1;
  if (offset > end && current < last) {
    return Math.max(current + 1, nearestStop(plan, offset));
  }
  if (offset < start && current > 0) {
    return Math.min(current - 1, nearestStop(plan, offset));
  }
  return null;
}

/** How far stop `index` has panned at a scroll offset. */
export function restPan(
  plan: GlidePlan,
  index: number,
  offset: number
): number {
  return clamp(offset - (plan.docks[index] ?? 0), 0, plan.pans[index] ?? 0);
}

/** Scroll offset that shows stop `index` panned by `pan`. */
export function landingOffset(
  plan: GlidePlan,
  index: number,
  pan: number
): number {
  return (plan.docks[index] ?? 0) + clamp(pan, 0, plan.pans[index] ?? 0);
}
