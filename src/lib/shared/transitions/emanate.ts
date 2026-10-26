/**
 * emanate: a sheet of cards arriving from a landed element.
 *
 * The second half of the start placement beat. The tapped start flies into the
 * workspace start cell (`start-placement-morph.ts`); when the option sheet then
 * shows, each card fades up while gliding outward from the direction of that
 * cell, so the landing reads as having pushed the options into place. Cards
 * nearer the cell arrive first, equal distances together, the farthest last.
 *
 * Each card works out its own timing from three rectangles (itself, the
 * origin, the sheet), so no card needs to know about any other. The tween
 * animates only `opacity` and `transform`, which the compositor runs while the
 * sheet's first mount keeps the main thread busy.
 *
 * Fallbacks: no origin (an embed with no workspace, or the start cell has not
 * drawn) is exactly the shared `arrive` keyed by `index`; reduced motion lands
 * instantly, as `arrive` does.
 *
 * Written against the shared clock only, so it can move into
 * `@austencloud/motion` unchanged once a second product needs it.
 */
import { cubicOut } from "svelte/easing";
import type { TransitionConfig } from "svelte/transition";
import { arrive, reducedMotion } from "./motion";
import { DURATION, SLIDE } from "./transitions";

/**
 * These mirror `arrive`'s own constants in `@austencloud/motion`
 * (ARRIVE_DELAY_MS and ARRIVE_STAGGER_CAP_MS): the wait before the first
 * arrival, and the most the arrivals spread out after it.
 */
export const EMANATE_LEAD_MS = 110;
export const EMANATE_SPREAD_MS = 220;

/** From the sheet's first paint to the last card settling. */
export const EMANATE_WINDOW_MS =
  EMANATE_LEAD_MS + EMANATE_SPREAD_MS + DURATION.emphasis;

/** The part of a `DOMRect` the timing reads. */
export type EmanateRect = Pick<DOMRectReadOnly, "left" | "top" | "width" | "height">;

export interface EmanateTiming {
  /** Milliseconds before this card starts. */
  delay: number;
  /** Where the card starts, relative to its slot: `SLIDE.lg` toward the origin. */
  dx: number;
  dy: number;
}

function centre(rect: EmanateRect): { x: number; y: number } {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/**
 * One card's arrival. The distance from the origin's centre to the card's
 * centre, over the distance to the sheet's farthest corner, places the card in
 * the spread; the push points from the card toward the origin.
 */
export function emanateTiming({
  card,
  origin,
  bounds,
}: {
  card: EmanateRect;
  origin: EmanateRect;
  bounds: EmanateRect;
}): EmanateTiming {
  const from = centre(origin);
  const at = centre(card);

  const right = bounds.left + bounds.width;
  const bottom = bounds.top + bounds.height;
  const reach = Math.max(
    Math.hypot(bounds.left - from.x, bounds.top - from.y),
    Math.hypot(right - from.x, bounds.top - from.y),
    Math.hypot(bounds.left - from.x, bottom - from.y),
    Math.hypot(right - from.x, bottom - from.y)
  );

  const towardX = from.x - at.x;
  const towardY = from.y - at.y;
  const distance = Math.hypot(towardX, towardY);
  const fraction =
    reach > 0 ? Math.min(1, Math.max(0, distance / reach)) : 0;
  const push = distance > 0 ? SLIDE.lg / distance : 0;

  return {
    delay: EMANATE_LEAD_MS + fraction * EMANATE_SPREAD_MS,
    dx: towardX * push,
    dy: towardY * push,
  };
}

export interface EmanateParams {
  /** The landed element's box, or null when there is nothing to come from. */
  origin?: (() => EmanateRect | null) | undefined;
  /** The sheet's box; its farthest corner from the origin is the full spread. */
  bounds?: (() => EmanateRect | null) | undefined;
  /** The card's place in its list, for the `arrive` fallback. */
  index?: number;
}

/** Intro for a card in a sheet arriving from a landed element. */
export function emanate(
  node: Element,
  { origin, bounds, index = 0 }: EmanateParams = {}
): TransitionConfig {
  if (reducedMotion()) return { delay: 0, duration: 0 };

  const from = origin?.() ?? null;
  const sheet = from ? (bounds?.() ?? null) : null;
  if (!from || !sheet) return arrive(node, { index });

  const { delay, dx, dy } = emanateTiming({
    card: node.getBoundingClientRect(),
    origin: from,
    bounds: sheet,
  });

  // The wait is folded into the tween rather than passed as Svelte's `delay`.
  // Svelte runs a delay as a placeholder animation and starts the real one
  // from its finish handler, on the main thread; a pick or the sheet's own
  // mount blocking that thread would then hold a card invisible past its
  // slot. One animation, holding at the start for `delay`, runs on the
  // compositor from the first frame.
  const duration = DURATION.emphasis;
  const total = delay + duration;
  return {
    duration: total,
    css: (t) => {
      const p = cubicOut(Math.min(1, Math.max(0, (t * total - delay) / duration)));
      const u = 1 - p;
      return (
        `opacity: ${p}; transform: translate(${u * dx}px, ${u * dy}px)` +
        ` scale(${0.96 + 0.04 * p});`
      );
    },
  };
}
