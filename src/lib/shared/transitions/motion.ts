import { cubicInOut } from "svelte/easing";
import { fade, type TransitionConfig } from "svelte/transition";
import {
  DURATION,
  EASE_STANDARD,
  flyFade as packageFlyFade,
  growFade as packageGrowFade,
  motionDuration,
  popIn as packagePopIn,
  reducedMotion,
} from "@austencloud/motion";
import { replayRecording } from "#lib/shared/analytics/replay-recording.js";
import { cssCubicBezier } from "./ws-ease";

// Shared owners come from the package (same code Ringmaster and the website
// run). Rule: docs/architecture/visual-design-canon.md §9.
export {
  Crossfade,
  EASE_STANDARD,
  EASE_STANDARD_IN,
  EASE_STANDARD_OUT,
  STEP_DRIFT_PX,
  arrive,
  flipDuration,
  leave,
  motionDuration,
  reducedMotion,
} from "@austencloud/motion";

// The package's fades, made visible to session replay (see recordedMotion).
// Most of the Composer's in/out/transition directives use these four.
export const flyFade = recordedMotion(packageFlyFade);
export const growFade = recordedMotion(packageGrowFade);
// Composer also transitions SVG groups. The package implementation only
// ignores the node's type, so the wider signature is safe.
export const popIn = recordedMotion(
  packagePopIn as (
    node: Element,
    params?: Parameters<typeof packagePopIn>[1]
  ) => ReturnType<typeof packagePopIn>
);

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

export interface ReleaseSettle {
  durationMs: number;
  /** A `cubic-bezier()` whose opening speed is the release speed. */
  easing: string;
}

/**
 * The settle after a drag lets go: a CSS timing that leaves the release point
 * at the hand's own speed and eases into the destination, so the surface
 * neither pauses nor lurches when the pointer lifts.
 *
 * `velocity` is px/ms toward the destination and `distance` the px still to
 * travel. The duration aims for the hand's average pace and stays within
 * `DURATION.normal`..`DURATION.dramatic`, so a drawer's own close timer still
 * covers it. Null under reduced motion or with nothing left to travel.
 */
export function releaseSettle(
  velocity: number,
  distance: number
): ReleaseSettle | null {
  const maxMs = motionDuration(DURATION.dramatic);
  if (maxMs === 0 || !(distance > 0)) return null;
  const speed = Number.isFinite(velocity) ? Math.max(0, velocity) : 0;
  const minMs = Math.min(DURATION.normal, maxMs);
  const durationMs = Math.round(
    speed > 0 ? Math.min(maxMs, Math.max(minMs, (2 * distance) / speed)) : maxMs
  );
  // cubic-bezier(1/3, y1, 2/3, 1) opens with slope 3·y1 (progress per unit
  // time), so y1 = speed·duration / (3·distance) starts at the hand's speed.
  const y1 = Math.min(1, (speed * durationMs) / (3 * distance));
  return {
    durationMs,
    easing: `cubic-bezier(0.333, ${y1.toFixed(3)}, 0.667, 1)`,
  };
}

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

/** True while a route change's view transition runs (@austencloud/motion
 *  marks the root with `route-transition`). */
function leavingRoute(): boolean {
  return (
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("route-transition")
  );
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
 *
 * An outro while the route changes is skipped: the leaving page is already
 * in the view transition's snapshot, and a `|global` outro would keep the
 * whole old page mounted beside the new one until it ends (the Guide's
 * Dual-Shift page lingered ~500 ms under the next topic, 2026-11-01).
 */
function restingFade(
  node: Element,
  {
    duration = DURATION.fast,
    delay = 0,
    dimmedBy = [],
    opacity = 1,
    easing,
  }: OpaqueFadeParams = {},
  options?: { direction?: "in" | "out" | "both" }
): TransitionConfig {
  const ms = motionDuration(duration);
  if (ms === 0) return { duration: 0 };
  if (options?.direction === "out" && leavingRoute()) return { duration: 0 };
  if (dimmedBy.some((name) => node.classList.contains(name))) {
    return fade(node, { duration: ms, delay, easing });
  }
  return { duration: ms, delay, easing, css: (t) => `opacity: ${t * opacity}` };
}

export const opaqueFade = recordedMotion(restingFade);

// The inline values a recorded transition found on each node before it first
// wrote, shared by every transition on that node so an outro reversed into an
// intro still restores what the node had before either began.
const inlineBeforeMotion = new WeakMap<
  Element,
  Map<string, { value: string; priority: string }>
>();

/**
 * While session replay records this visit, the transition is painted frame by
 * frame into the node's inline style instead of handed to the browser as a Web
 * Animation. The recorder sees style changes but not Web Animations, so a
 * replay showed every fade and slide as a jump (and cross-fading glyphs as two
 * at full strength). An intro hands the node back with its inline style as it
 * found it. Visits nobody records keep the Web Animation, which costs nothing
 * per frame on the main thread.
 */
export function recordedMotion<N extends Element, P, O>(
  transition: (node: N, params?: P, options?: O) => TransitionConfig
): (node: N, params?: P, options?: O) => TransitionConfig {
  return (node, params, options) => {
    const style = (node as Element as HTMLElement | SVGElement).style;
    // A transition cut short left its frame inline. Put the node back first,
    // so the next one measures and pins the node's own style, not that frame.
    restoreInlineBeforeMotion(node, style);
    const config = transition(node, params, options);
    const { css, tick, ...rest } = config;
    if (!css || !replayRecording()) return config;
    return {
      ...rest,
      tick: (t, u) => {
        tick?.(t, u);
        let before = inlineBeforeMotion.get(node);
        if (!before) inlineBeforeMotion.set(node, (before = new Map()));
        for (const declaration of css(t, u).split(";")) {
          const colon = declaration.indexOf(":");
          if (colon < 0) continue;
          const property = declaration.slice(0, colon).trim();
          if (!before.has(property)) {
            before.set(property, {
              value: style.getPropertyValue(property),
              priority: style.getPropertyPriority(property),
            });
          }
          style.setProperty(property, declaration.slice(colon + 1).trim());
        }
        if (t === 1) restoreInlineBeforeMotion(node, style);
      },
    };
  };
}

function restoreInlineBeforeMotion(
  node: Element,
  style: CSSStyleDeclaration
): void {
  const before = inlineBeforeMotion.get(node);
  if (!before) return;
  for (const [property, { value, priority }] of before) {
    if (value) style.setProperty(property, value, priority);
    else style.removeProperty(property);
  }
  inlineBeforeMotion.delete(node);
}
