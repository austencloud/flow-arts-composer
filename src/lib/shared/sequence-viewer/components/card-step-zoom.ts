/**
 * Rules for the enlarged step on a focused Card: which steps it walks
 * through, when a released swipe moves to the next one, and the transform
 * that lays the enlarged picture over the card cell it grows out of.
 *
 * Kept free of the DOM so the swipe thresholds and the lift geometry are
 * tested directly; CardStepZoom.svelte owns the elements and the motion.
 */

export interface ZoomBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Index -1 is the start position, drawn before step 1. */
export const START_INDEX = -1;

/**
 * The steps the enlarged view walks through, in card order. The start
 * position joins only when the card shows it.
 */
export function zoomStepOrder(
  indices: readonly number[],
  includeStart: boolean
): number[] {
  return [...new Set(indices)]
    .filter((index) => index >= 0 || (includeStart && index === START_INDEX))
    .sort((a, b) => a - b);
}

/** The step one place before or after `current`, or null at either end. */
export function neighborStep(
  order: readonly number[],
  current: number,
  delta: -1 | 1
): number | null {
  const at = order.indexOf(current);
  if (at < 0) return null;
  return order[at + delta] ?? null;
}

/** Movement below this, in px, is a tap rather than a swipe. */
export const SWIPE_SLOP_PX = 10;

/** A release this fast (px/ms) moves on even when the drag was short. */
export const FLICK_SPEED = 0.35;

/**
 * Where a released horizontal swipe goes: +1 for the next step (dragged
 * left), -1 for the previous one, 0 to settle back. A drag past a third of
 * the picture moves on, and so does a quick flick in the drag's direction.
 */
export function swipeStep(
  dx: number,
  velocity: number,
  width: number
): -1 | 0 | 1 {
  const far = Math.abs(dx) > width / 3;
  const flick =
    Math.abs(dx) > SWIPE_SLOP_PX &&
    Math.abs(velocity) > FLICK_SPEED &&
    Math.sign(velocity) === Math.sign(dx);
  if (!far && !flick) return 0;
  return dx < 0 ? 1 : -1;
}

/**
 * Drag past the first or last step: the picture follows at a fraction of the
 * hand's travel, so it gives without ever moving on.
 */
export function edgeResistance(dx: number): number {
  return dx * 0.3;
}

/**
 * The transform that draws a picture laid out at `to` over the box `from`
 * (the card cell). Paired with `transform-origin: 0 0`, animating from this
 * to none grows the picture out of the cell into its place.
 */
export function liftTransform(from: ZoomBox, to: ZoomBox): string {
  if (!(to.width > 0) || !(to.height > 0)) return "none";
  const scaleX = from.width / to.width;
  const scaleY = from.height / to.height;
  const dx = from.left - to.left;
  const dy = from.top - to.top;
  return `translate(${round(dx)}px, ${round(dy)}px) scale(${round(scaleX, 4)}, ${round(scaleY, 4)})`;
}

/** True when some of `box` lies inside a viewport of the given size. */
export function boxOnScreen(
  box: ZoomBox,
  viewportWidth: number,
  viewportHeight: number
): boolean {
  return (
    box.width > 0 &&
    box.height > 0 &&
    box.left < viewportWidth &&
    box.top < viewportHeight &&
    box.left + box.width > 0 &&
    box.top + box.height > 0
  );
}

function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
