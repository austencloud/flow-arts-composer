/**
 * emanate: a sheet of cards arriving from a landed element.
 *
 * The second half of the start placement beat. The tapped start flies into the
 * workspace start cell (`start-placement-morph.ts`); when the option sheet then
 * shows, each card fades up while gliding outward from the direction of that
 * cell, so the landing reads as having pushed the options into place. Cards
 * nearer the cell arrive first, equal distances together, the farthest last.
 *
 * Two shapes, chosen by the host's layout. Side by side (desktop) the
 * arrival is radial: straight-line distance, push toward the cell. Stacked
 * (phones, the cell above the sheet) it runs in rows: vertical distance only,
 * so a row lands together, and a straight vertical push. The layout says which,
 * not the sheet's box: on the first pick after a page load the cards mount
 * while that box is still the panel the start picker filled, which on a phone
 * reaches up past the start cell and on desktop spans it sideways.
 *
 * Stacked sheets can also run as one wave. The sheet's own controls (level,
 * turn rows, type tabs) take part as well as the cards: the whole sheet folds
 * in from its top edge at one speed, a row about every 60 ms, each row dropping
 * the same `SLIDE.lg`. Timings count from the wave's start (its first row
 * mounting) rather than from each element's mount, because the cards mount a
 * beat after the controls; a row that mounts late still lands on its beat, and
 * one that mounts after its beat starts at once. Elements that share a row can step across it, left to
 * right (the level pills).
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

/** The wave's speed down a stacked sheet: a row of about 80 px every 60 ms. */
export const EMANATE_WAVE_MS_PER_PX = 0.75;
/** How far a row that steps across spreads, first element to last. */
export const EMANATE_ACROSS_MS = DURATION.instant;

/** From the sheet's first paint to the last card settling. */
export const EMANATE_WINDOW_MS =
  EMANATE_LEAD_MS + EMANATE_SPREAD_MS + DURATION.emphasis;

/** The part of a `DOMRect` the timing reads. */
export type EmanateRect = Pick<
  DOMRectReadOnly,
  "left" | "top" | "width" | "height"
>;

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
 * One card's arrival. Radial: the distance from the origin's centre to the
 * card's centre, over the distance to the sheet's farthest corner, places the
 * card in the spread, and the push points from the card toward the origin.
 * Stacked: the same on the vertical axis alone; the far edge is the sheet's
 * bottom (origin in its upper half) or top (origin in its lower half), and the
 * push is straight up or down toward the origin.
 */
export function emanateTiming({
  card,
  origin,
  bounds,
  stacked,
}: {
  card: EmanateRect;
  origin: EmanateRect;
  bounds: EmanateRect;
  /** The layout stacks the origin above or below the sheet. */
  stacked: boolean;
}): EmanateTiming {
  const from = centre(origin);
  const at = centre(card);

  const right = bounds.left + bounds.width;
  const bottom = bounds.top + bounds.height;

  // The far edge holds still while a stale box settles: on a phone the old
  // panel's top edge moves down to the sheet's, but its bottom is already
  // the sheet's bottom.
  if (stacked) {
    const above = from.y < bounds.top + bounds.height / 2;
    const reach = Math.abs((above ? bottom : bounds.top) - from.y);
    const fraction =
      reach > 0 ? Math.min(1, Math.max(0, Math.abs(at.y - from.y) / reach)) : 0;
    return {
      delay: EMANATE_LEAD_MS + fraction * EMANATE_SPREAD_MS,
      dx: 0,
      dy: above ? -SLIDE.lg : SLIDE.lg,
    };
  }

  const reach = Math.max(
    Math.hypot(bounds.left - from.x, bounds.top - from.y),
    Math.hypot(right - from.x, bounds.top - from.y),
    Math.hypot(bounds.left - from.x, bottom - from.y),
    Math.hypot(right - from.x, bottom - from.y)
  );

  const towardX = from.x - at.x;
  const towardY = from.y - at.y;
  const distance = Math.hypot(towardX, towardY);
  const fraction = reach > 0 ? Math.min(1, Math.max(0, distance / reach)) : 0;
  const push = distance > 0 ? SLIDE.lg / distance : 0;

  return {
    delay: EMANATE_LEAD_MS + fraction * EMANATE_SPREAD_MS,
    dx: towardX * push,
    dy: towardY * push,
  };
}

/** Where a stacked sheet's wave starts, and how long ago it started. */
export interface EmanateWave {
  /** The sheet's box, read in the same frame as the element. */
  sheet: EmanateRect;
  /** Milliseconds since the wave started. */
  elapsed: number;
}

/**
 * One element's place in a stacked sheet's wave: its distance below the
 * sheet's top edge at the wave's speed, less the time already gone, plus its
 * share of `EMANATE_ACROSS_MS` when its row steps across. The push is a
 * straight drop.
 */
export function emanateWaveTiming({
  card,
  wave,
  across = false,
}: {
  card: EmanateRect;
  wave: EmanateWave;
  across?: boolean;
}): EmanateTiming {
  const at = centre(card);
  const down = Math.max(0, at.y - wave.sheet.top);
  const step =
    across && wave.sheet.width > 0
      ? Math.min(1, Math.max(0, (at.x - wave.sheet.left) / wave.sheet.width)) *
        EMANATE_ACROSS_MS
      : 0;
  return {
    delay: Math.max(0, down * EMANATE_WAVE_MS_PER_PX + step - wave.elapsed),
    dx: 0,
    dy: -SLIDE.lg,
  };
}

export interface EmanateParams {
  /** The landed element's box, or null when there is nothing to come from. */
  origin?: (() => EmanateRect | null) | undefined;
  /** The sheet's box; its farthest corner from the origin is the full spread. */
  bounds?: (() => EmanateRect | null) | undefined;
  /** True when the layout stacks the origin above or below the sheet. Radial when absent. */
  stacked?: (() => boolean) | undefined;
  /**
   * A stacked sheet's wave. When present and the layout is stacked, the
   * element takes its place in the wave instead of timing itself from the
   * origin.
   */
  wave?: (() => EmanateWave | null) | undefined;
  /** The element's row steps across, left to right. Wave only. */
  across?: boolean;
  /** The card's place in its list, for the `arrive` fallback. */
  index?: number;
}

/**
 * An intro now, or one Svelte works out once the mount around it has settled
 * (its deferred form: called after the update, before the paint).
 */
export type EmanateIntro = TransitionConfig | (() => TransitionConfig);

/** Intro for a card in a sheet arriving from a landed element. */
export function emanate(
  node: Element,
  { origin, bounds, stacked, wave, across, index = 0 }: EmanateParams = {}
): EmanateIntro {
  if (reducedMotion()) return { delay: 0, duration: 0 };

  const isStacked = stacked?.() ?? false;

  function fromOrigin(): TransitionConfig {
    const from = origin?.() ?? null;
    const sheet = from ? (bounds?.() ?? null) : null;
    if (!from || !sheet) return arrive(node, { index });
    return slideIn(
      emanateTiming({
        card: node.getBoundingClientRect(),
        origin: from,
        bounds: sheet,
        stacked: isStacked,
      })
    );
  }

  if (!isStacked || !wave) return fromOrigin();

  // The wave reads positions once the mount has settled. A sheet's first
  // layout can be a placeholder that its own effects replace before anything
  // paints (a section's column count, sized from measurements taken after it
  // mounts); read then, cards that share a row would land on different beats.
  // Reading the wave here also starts its clock with the first row.
  const started = wave();
  if (!started) return fromOrigin();
  return () => {
    const now = wave() ?? started;
    return slideIn(
      emanateWaveTiming({
        card: node.getBoundingClientRect(),
        wave: now,
        across,
      })
    );
  };
}

function slideIn({ delay, dx, dy }: EmanateTiming): TransitionConfig {
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
      const p = cubicOut(
        Math.min(1, Math.max(0, (t * total - delay) / duration))
      );
      const u = 1 - p;
      return (
        `opacity: ${p}; transform: translate(${u * dx}px, ${u * dy}px)` +
        ` scale(${0.96 + 0.04 * p});`
      );
    },
  };
}
