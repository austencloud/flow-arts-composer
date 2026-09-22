import { cubicInOut, cubicOut } from "svelte/easing";
import type { TransitionConfig } from "svelte/transition";
import { DURATION } from "./transitions";

const STANDARD_MOTION_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";

/**
 * motion — reduced-motion-aware Svelte transitions on the DURATION tokens.
 *
 * Svelte JS transitions ignore the `prefers-reduced-motion` media query that
 * the CSS layer already respects, so every helper here collapses to an instant
 * show/hide when the user asks for reduced motion. Reach for these instead of
 * raw `svelte/transition` imports in feature code.
 */

/** True when the user prefers reduced motion. Safe on the server (false). */
export function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    ((typeof document !== "undefined" &&
      document.documentElement.dataset.motionPreference === "reduce") ||
      (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ??
        false))
  );
}

/** Clamp a duration (ms) to 0 under reduced motion — for flip/scale params. */
export function motionDuration(ms: number): number {
  return reducedMotion() ? 0 : ms;
}

/** Default duration for `animate:flip` list reordering. */
export function flipDuration(): number {
  return motionDuration(DURATION.normal);
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
  let animation: Animation | null = null;
  let animationStart = 0;
  let animationTarget = 0;

  return {
    resize(from: number, target: number): Animation | null {
      animation?.cancel();
      animation = null;

      // The live style is the destination. `backwards` holds the visible
      // starting height until the first animation frame, so the box cannot
      // flash at its new size before moving there.
      element.style.height = `${target}px`;
      const effectiveDuration =
        element.dataset.dragging === "true" ? 0 : motionDuration(duration);
      if (effectiveDuration === 0 || Math.abs(from - target) < 0.5) {
        return null;
      }

      const nextAnimation = element.animate(
        [{ height: `${from}px` }, { height: `${target}px` }],
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
          // Keep owning the frame between observations. Releasing it to auto
          // lets a child's first reflow briefly move the frame before RO runs.
          // The independently sized content wrapper supplies the next target.
        },
        { once: true }
      );
      return nextAnimation;
    },

    currentHeight(): number | null {
      if (!animation) return null;
      const progress = animation.effect?.getComputedTiming().progress;
      if (typeof progress !== "number") return animationStart;
      return animationStart + (animationTarget - animationStart) * progress;
    },

    cancel(): void {
      animation?.cancel();
      animation = null;
      element.style.height = "";
    },
  };
}

interface FlyFadeParams {
  duration?: number;
  delay?: number;
  /** Drift-in offsets in px (element eases from here to rest). */
  x?: number;
  y?: number;
}

/**
 * Fade + short translate drift. No layout animation — use for elements at the
 * end of a row or in reserved space (alerts, status text, badges) where the
 * mount itself doesn't shove siblings.
 */
export function flyFade(
  node: HTMLElement,
  { duration = DURATION.normal, delay = 0, x = 0, y = 4 }: FlyFadeParams = {}
): TransitionConfig {
  void node;
  return {
    duration: motionDuration(duration),
    delay,
    easing: cubicOut,
    css: (t) =>
      `opacity: ${t}; transform: translate(${(1 - t) * x}px, ${(1 - t) * y}px);`,
  };
}

interface GrowFadeParams {
  duration?: number;
  delay?: number;
  /** Which box dimension grows: "y" = height (list rows), "x" = width (inline chips). */
  axis?: "x" | "y";
  /** Extra drift-in offset in px along the cross feel (translateX). */
  x?: number;
}

interface FlexPresenceParams {
  duration?: number;
  delay?: number;
  /** The PanelGroup direction. Used when flex-basis resolves to `auto`. */
  axis?: "x" | "y";
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
  }: FlexPresenceParams = {}
): TransitionConfig {
  const style = getComputedStyle(node);
  const rect = node.getBoundingClientRect();
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
    easing: cubicInOut,
    css: (t) =>
      `flex-grow: ${t * flexGrow}; flex-basis: ${t * flexBasis}px;` +
      ` opacity: ${Math.min(1, t * 1.35)}; overflow: hidden;`,
  };
}

/**
 * Size + fade: the element's own width/height animates from 0 so siblings
 * REFLOW smoothly instead of snapping when it mounts/unmounts. The inline-flow
 * cousin of dockSlide — use for list rows, inline count chips, expanding
 * settings groups.
 */
export function growFade(
  node: HTMLElement,
  {
    duration = DURATION.normal,
    delay = 0,
    axis = "y",
    x = 0,
  }: GrowFadeParams = {}
): TransitionConfig {
  // Like svelte's `slide`, collapse padding/margin/border along the axis too —
  // otherwise a padded element ends its collapse with a residual-height pop.
  const style = getComputedStyle(node);
  const rect = node.getBoundingClientRect();
  const size = axis === "y" ? rect.height : rect.width;
  const props =
    axis === "y"
      ? ([
          "height",
          "padding-top",
          "padding-bottom",
          "margin-top",
          "margin-bottom",
          "border-top-width",
          "border-bottom-width",
        ] as const)
      : ([
          "width",
          "padding-left",
          "padding-right",
          "margin-left",
          "margin-right",
          "border-left-width",
          "border-right-width",
        ] as const);
  const values = props.map((p) =>
    p === "height" || p === "width"
      ? size
      : parseFloat(style.getPropertyValue(p)) || 0
  );
  return {
    duration: motionDuration(duration),
    delay,
    easing: cubicOut,
    css: (t) =>
      props.map((p, i) => `${p}: ${t * (values[i] ?? 0)}px;`).join(" ") +
      ` opacity: ${t}; overflow: hidden; box-sizing: border-box;` +
      ` transform: translateX(${(1 - t) * x}px);`,
  };
}

interface PopInParams {
  duration?: number;
  delay?: number;
  /** Starting scale. */
  start?: number;
}

/** Scale + fade pop for small controls (icon buttons, badges). */
export function popIn(
  node: HTMLElement,
  { duration = DURATION.fast, delay = 0, start = 0.8 }: PopInParams = {}
): TransitionConfig {
  void node;
  return {
    duration: motionDuration(duration),
    delay,
    easing: cubicOut,
    css: (t) => `opacity: ${t}; transform: scale(${start + (1 - start) * t});`,
  };
}
