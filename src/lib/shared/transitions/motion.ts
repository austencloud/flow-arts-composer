import { cubicInOut } from "svelte/easing";
import { fade, type TransitionConfig } from "svelte/transition";
import {
  DURATION,
  EASE_STANDARD,
  motionDuration,
  popIn as packagePopIn,
  reducedMotion,
} from "@austencloud/motion";
import { cssCubicBezier } from "./ws-ease";

// Shared owners come from the package (same code Ringmaster and the website
// run). Rule: docs/architecture/visual-design-canon.md §9.
export {
  Crossfade,
  STEP_DRIFT_PX,
  arrive,
  flipDuration,
  flyFade,
  growFade,
  leave,
  motionDuration,
  reducedMotion,
} from "@austencloud/motion";

// Composer also transitions SVG groups. The package implementation only
// ignores this argument, so keep its identity while retaining that wider use.
export const popIn = packagePopIn as (
  node: Element,
  params?: Parameters<typeof packagePopIn>[1]
) => ReturnType<typeof packagePopIn>;

const STANDARD_MOTION_EASING = EASE_STANDARD;

/**
 * JS twin of `--ease-in-out`, the curve PanelGroup tracks move on. Give it to
 * a Svelte transition that has to move in step with a panel slide.
 */
export const standardEasing = cssCubicBezier(0.4, 0, 0.2, 1);

/**
 * JS twin of `--ease-out` (app.css), for Web Animations, which take a literal
 * easing string and reject a CSS variable.
 */
export const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";

/** JS twin of `--ease-spring` (app.css): the overshoot curve, for Web Animations. */
export const EASE_SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)";

/** JS twin of `--ease-out`, for a Svelte transition that has to move in step
 *  with a CSS transition on that curve. */
export const easeOut = cssCubicBezier(0.16, 1, 0.3, 1);

/**
 * motion — reduced-motion-aware Svelte transitions on the DURATION tokens.
 *
 * Svelte JS transitions ignore the `prefers-reduced-motion` media query that
 * the CSS layer already respects, so every helper here collapses to an instant
 * show/hide when the user asks for reduced motion. Reach for these instead of
 * raw `svelte/transition` imports in feature code.
 */

export interface DestinationFadeOptions {
  /** Starting opacity of a fresh fade. The default is a quiet dip. */
  from?: number;
  /** Hold the start for this long, e.g. until a resizing box has room. */
  delay?: number;
  duration?: number;
}

/** A quiet arrival cue for an instant jump within a mounted content surface. */
export function createDestinationFade(
  element: HTMLElement,
  {
    from = 0.55,
    delay = 0,
    duration = DURATION.fast,
  }: DestinationFadeOptions = {}
) {
  let animation: Animation | null = null;
  const cancel = () => {
    animation?.cancel();
    animation = null;
  };
  const respectMotionPreference = () => {
    if (reducedMotion()) cancel();
  };
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", respectMotionPreference);
  const observer = new MutationObserver(respectMotionPreference);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-motion-preference"],
  });

  return {
    play() {
      // Repeated navigation continues from the visible frame instead of
      // flashing back to the beginning or queuing another animation.
      const opacity = animation
        ? getComputedStyle(element).opacity
        : String(from);
      cancel();
      if (reducedMotion()) return;
      const next = element.animate([{ opacity }, { opacity: 1 }], {
        duration,
        delay,
        easing: STANDARD_MOTION_EASING,
        // Hold the starting opacity through the delay.
        fill: "backwards",
      });
      animation = next;
      next.onfinish = () => {
        if (animation === next) animation = null;
      };
    },
    destroy() {
      cancel();
      media.removeEventListener("change", respectMotionPreference);
      observer.disconnect();
    },
  };
}

/**
 * Owns a content-sized overlay's height while it moves between two measured
 * layouts. The caller measures the natural destination; this keeps the visual
 * starting point when a second change arrives before the first one settles.
 */
export interface IntrinsicHeightMotion {
  resize(from: number, target: number): Animation | null;
  currentHeight(): number | null;
  cancel(): void;
}

/** The same motion on either axis: a control whose label changes eases its
 * width the way a dialog eases its height. */
export interface IntrinsicSizeMotion {
  resize(from: number, target: number): Animation | null;
  currentSize(): number | null;
  cancel(): void;
}

export interface IntrinsicSizeMotionOptions {
  dimension?: "width" | "height";
  duration?: number;
  /**
   * Hand the size back to content sizing once the ease lands. A dialog keeps
   * owning its frame between observations; a button whose layout can still
   * change (a container query making it full width) must not stay pinned.
   */
  release?: boolean;
}

/**
 * Animate an element's own width or height without scaling the content inside
 * it. `target` must come from layout metrics such as `offsetHeight`, rather
 * than a transformed screen rectangle, so opening transforms cannot freeze a
 * card at the wrong size.
 */
export function createIntrinsicSizeMotion(
  element: HTMLElement,
  {
    dimension = "height",
    duration = DURATION.normal,
    release = false,
  }: IntrinsicSizeMotionOptions = {}
): IntrinsicSizeMotion {
  let animation: Animation | null = null;
  let animationStart = 0;
  let animationTarget = 0;

  return {
    resize(from: number, target: number): Animation | null {
      animation?.cancel();
      animation = null;

      // The live style is the destination. `backwards` holds the visible
      // starting size until the first animation frame, so the box cannot
      // flash at its new size before moving there.
      element.style[dimension] = `${target}px`;
      const effectiveDuration =
        element.dataset.dragging === "true" ? 0 : motionDuration(duration);
      if (effectiveDuration === 0 || Math.abs(from - target) < 0.5) {
        if (release) element.style[dimension] = "";
        return null;
      }

      const nextAnimation = element.animate(
        [{ [dimension]: `${from}px` }, { [dimension]: `${target}px` }],
        {
          duration: effectiveDuration,
          easing: STANDARD_MOTION_EASING,
          fill: "backwards",
        }
      );
      animation = nextAnimation;
      animationStart = from;
      animationTarget = target;
      nextAnimation.addEventListener(
        "finish",
        () => {
          if (animation !== nextAnimation) return;
          animation = null;
          // Without `release` this keeps owning the frame between
          // observations. Releasing it to auto would let a child's first
          // reflow briefly move the frame before RO runs; the independently
          // sized content wrapper supplies the next target.
          if (release) element.style[dimension] = "";
        },
        { once: true }
      );
      return nextAnimation;
    },

    currentSize(): number | null {
      if (!animation) return null;
      const progress = animation.effect?.getComputedTiming().progress;
      if (typeof progress !== "number") return animationStart;
      return animationStart + (animationTarget - animationStart) * progress;
    },

    cancel(): void {
      animation?.cancel();
      animation = null;
      element.style[dimension] = "";
    },
  };
}

/**
 * Animate an overlay's own height without scaling the content inside it.
 * `target` must come from layout metrics such as `offsetHeight`, rather than a
 * transformed screen rectangle, so opening transforms cannot freeze a card at
 * the wrong size.
 */
export function createIntrinsicHeightMotion(
  element: HTMLElement,
  duration = DURATION.normal
): IntrinsicHeightMotion {
  const motion = createIntrinsicSizeMotion(element, { duration });
  return {
    resize: motion.resize,
    currentHeight: motion.currentSize,
    cancel: motion.cancel,
  };
}

interface FlexPresenceParams {
  duration?: number;
  delay?: number;
  /** The PanelGroup direction. Used when flex-basis resolves to `auto`. */
  axis?: "x" | "y";
  /**
   * Animate the element's measured size instead of its flex share. Its
   * siblings then resize in step with the transition's own curve, so a CSS
   * transition on the same duration and curve (a sliding indicator sized from
   * the item count) tracks them exactly. A shrinking flex share moves its
   * siblings on a different curve from the one the transition runs.
   */
  measured?: boolean;
  easing?: (t: number) => number;
}

/**
 * Flex allocation + fade for a structural panel entering or leaving a shared
 * flex workspace. Unlike `growFade`, this animates the flex track itself, so
 * the neighbouring panel travels into the released space instead of parking
 * at its new size before the outgoing content disappears.
 *
 * PanelGroup is the canonical consumer. Other flex workspaces should normally
 * compose PanelGroup; use this directly only when the element itself owns a
 * meaningful flex allocation.
 */
export function flexPresence(
  node: HTMLElement,
  {
    duration = DURATION.emphasis,
    delay = 0,
    axis = "y",
    measured = false,
    easing = cubicInOut,
  }: FlexPresenceParams = {}
): TransitionConfig {
  const style = getComputedStyle(node);
  const rect = node.getBoundingClientRect();
  if (measured) {
    // Its padding and its share of the container's gap go with it: a flex
    // item cannot shrink below its padding, and either one left behind makes
    // the siblings jump the rest of the way when the item is removed.
    const size = axis === "y" ? rect.height : rect.width;
    const padStart = Number.parseFloat(
      axis === "y" ? style.paddingTop : style.paddingLeft
    );
    const padEnd = Number.parseFloat(
      axis === "y" ? style.paddingBottom : style.paddingRight
    );
    const parent = node.parentElement;
    const parentStyle = parent ? getComputedStyle(parent) : null;
    const gap =
      Number.parseFloat(
        (axis === "y" ? parentStyle?.rowGap : parentStyle?.columnGap) ?? ""
      ) || 0;
    const side = axis === "y" ? "block" : "inline";
    return {
      duration: motionDuration(duration),
      delay,
      easing,
      css: (t) =>
        `flex: 0 0 ${t * size}px; min-${axis === "y" ? "height" : "width"}: 0;` +
        ` padding-${side}: ${t * padStart}px ${t * padEnd}px;` +
        ` margin-${side}-end: ${-(1 - t) * gap}px;` +
        ` opacity: ${Math.min(1, t * 1.35)}; overflow: hidden;`,
    };
  }
  const flexGrow = Number.parseFloat(style.flexGrow) || 0;
  const parsedBasis = Number.parseFloat(style.flexBasis);
  const flexBasis = Number.isFinite(parsedBasis)
    ? parsedBasis
    : axis === "y"
      ? rect.height
      : rect.width;

  return {
    duration: motionDuration(duration),
    delay,
    easing,
    css: (t) =>
      `flex-grow: ${t * flexGrow}; flex-basis: ${t * flexBasis}px;` +
      ` opacity: ${Math.min(1, t * 1.35)}; overflow: hidden;`,
  };
}

interface OpaqueFadeParams {
  duration?: number;
  delay?: number;
  /**
   * Classes that hold the node below full opacity. A node carrying one falls
   * back to Svelte's `fade`, which reads the opacity it should fade from.
   */
  dimmedBy?: readonly string[];
  /**
   * The opacity the node rests at, when the caller sets it itself (an SVG
   * `opacity` attribute bound to the same value).
   */
  opacity?: number;
  easing?: (t: number) => number;
}

/**
 * Svelte's `fade` for nodes whose resting opacity is known: full, or the
 * `opacity` the caller passes. `fade` reads the node's computed opacity before
 * it starts, even at zero duration, which forces a style recalc (and layout
 * inside size containers) for every element. Undo in the sequence grid paid
 * that once per entering and leaving cell, ~18 times in one frame.
 */
export function opaqueFade(
  node: Element,
  {
    duration = DURATION.fast,
    delay = 0,
    dimmedBy = [],
    opacity = 1,
    easing,
  }: OpaqueFadeParams = {}
): TransitionConfig {
  const ms = motionDuration(duration);
  if (ms === 0) return { duration: 0 };
  if (dimmedBy.some((name) => node.classList.contains(name))) {
    return fade(node, { duration: ms, delay, easing });
  }
  return { duration: ms, delay, easing, css: (t) => `opacity: ${t * opacity}` };
}
