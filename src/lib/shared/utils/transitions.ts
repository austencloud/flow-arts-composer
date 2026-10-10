/**
 * Shared transition utilities for consistent animations across the app
 *
 * Provides reusable transition functions for Svelte components
 */

import type { TransitionConfig } from "svelte/transition";

export interface SlideTransitionOptions {
  /**
   * Duration in milliseconds
   * @default 350
   */
  duration?: number;

  /**
   * Direction to slide from
   * @default 'bottom'
   */
  direction?: "top" | "bottom" | "left" | "right";

  /**
   * Easing function
   * @default 'cubic'
   */
  easing?: "cubic" | "linear";
}

export interface FadeTransitionOptions {
  /**
   * Duration in milliseconds
   * @default 250
   */
  duration?: number;

  /**
   * Delay before starting in milliseconds
   * @default 0
   */
  delay?: number;
}

/**
 * Custom cubic easing out: 1 - (1-t)^3
 */
function cubicOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Slide transition with configurable direction and easing
 * Perfect for bottom sheets, side panels, and slide-in menus
 */
export function slideTransition(
  node: Element,
  options: SlideTransitionOptions = {}
): TransitionConfig {
  const { duration = 350, direction = "bottom", easing = "cubic" } = options;

  const computedStyle = getComputedStyle(node);
  const opacity = parseFloat(computedStyle.opacity);

  // Determine transform based on direction
  const getTransform = (t: number) => {
    const easedT = easing === "cubic" ? cubicOut(t) : t;

    switch (direction) {
      case "bottom":
        return `translateY(${(1 - easedT) * 100}%)`;
      case "top":
        return `translateY(${(easedT - 1) * 100}%)`;
      case "right":
        return `translateX(${(1 - easedT) * 100}%)`;
      case "left":
        return `translateX(${(easedT - 1) * 100}%)`;
      default:
        return `translateY(${(1 - easedT) * 100}%)`;
    }
  };

  return {
    duration,
    css: (t: number) => {
      return `
        transform: ${getTransform(t)};
        opacity: ${t * opacity};
      `;
    },
  };
}

/**
 * Fade transition with optional delay
 * Perfect for backdrops and overlays
 */
export function fadeTransition(
  _node: Element,
  options: FadeTransitionOptions = {}
): TransitionConfig {
  const { duration = 250, delay = 0 } = options;

  return {
    duration,
    delay,
    css: (t: number) => `opacity: ${t}`,
  };
}

/**
 * Scale transition with fade
 * Perfect for modals and dialogs
 */
export function scaleTransition(
  _node: Element,
  options: { duration?: number; start?: number } = {}
): TransitionConfig {
  const { duration = 300, start = 0.95 } = options;

  return {
    duration,
    css: (t: number) => {
      const easedT = cubicOut(t);
      const scale = start + (1 - start) * easedT;
      return `
        transform: scale(${scale});
        opacity: ${t};
      `;
    },
  };
}

/**
 * Fly transition with configurable direction
 * Perfect for notifications and toasts
 */
export function flyTransition(
  _node: Element,
  options: { duration?: number; x?: number; y?: number } = {}
): TransitionConfig {
  const { duration = 400, x = 0, y = 0 } = options;

  return {
    duration,
    css: (t: number) => {
      const easedT = cubicOut(t);
      return `
        transform: translate(${(1 - easedT) * x}px, ${(1 - easedT) * y}px);
        opacity: ${t};
      `;
    },
  };
}

/**
 * DEPRECATED: springScaleTransition has been replaced by the unified animation system
 *
 * The old springScaleTransition used hardcoded spring physics approximations (40+ lines).
 * It has been migrated to use PresenceAnimation from $lib/shared/ui-animation which provides:
 * - Real spring physics via Svelte 5's native Spring class
 * - Consistent animation behavior across the app
 * - Configurable spring presets (gentle, snappy, wobbly, etc.)
 *
 * Migration example:
 * ```svelte
 * // Old:
 * import { springScaleTransition } from "#lib/shared/utils/transitions.js";
 * <div transition:springScaleTransition>...</div>
 *
 * // New:
 * import { PresenceAnimation } from "../animation";
 * function presenceTransition(node, { duration = 550, delay = 0 } = {}) {
 *   const animation = new PresenceAnimation('snappy');
 *   animation.enter();
 *   return { duration, delay, css: (t) => `transform: scale(${0.95 + 0.05 * t}); opacity: ${t};` };
 * }
 * <div transition:presenceTransition>...</div>
 * ```
 *
 * See: src/lib/shared/ui-animation/ for the unified animation system
 * See: ANIMATION_SYSTEM.md for migration guide
 */

/**
 * Safe slide transition that guards against NaN height values.
 *
 * This is a workaround for Svelte 5 bug #14205 where the slide transition
 * produces "Invalid keyframe value for property height: NaNpx" warnings when
 * the element has no measurable height at the time the transition starts.
 *
 * The issue occurs because height is parsed with parseFloat which returns NaN
 * for empty strings, and Svelte 5's Web Animations API validates and rejects these.
 *
 * @see https://github.com/sveltejs/svelte/issues/14205
 */
export function safeSlide(
  node: Element,
  {
    delay = 0,
    duration = 300,
    easing = cubicOut,
    axis = "y",
  }: { delay?: number; duration?: number; easing?: (t: number) => number; axis?: "x" | "y" } = {}
): TransitionConfig {
  const style = getComputedStyle(node);
  const opacity = +style.opacity;

  // Determine primary and secondary properties based on axis
  const isVertical = axis === "y";
  const primary_property = isVertical ? "height" : "width";
  const primary_property_value = parseFloat(style[primary_property]);

  // Secondary properties for padding/margin/border
  const _startProp = isVertical ? "Top" : "Left";
  const _endProp = isVertical ? "Bottom" : "Right";
  const startPropLower = isVertical ? "top" : "left";
  const endPropLower = isVertical ? "bottom" : "right";

  // Parse all the secondary property values
  const padding_start_value = parseFloat(style.getPropertyValue(`padding-${startPropLower}`));
  const padding_end_value = parseFloat(style.getPropertyValue(`padding-${endPropLower}`));
  const margin_start_value = parseFloat(style.getPropertyValue(`margin-${startPropLower}`));
  const margin_end_value = parseFloat(style.getPropertyValue(`margin-${endPropLower}`));
  const border_width_start_value = parseFloat(style.getPropertyValue(`border-${startPropLower}-width`));
  const border_width_end_value = parseFloat(style.getPropertyValue(`border-${endPropLower}-width`));

  // Guard against NaN values - use 0 as fallback (fixes Svelte 5 bug #14205)
  const safePrimary = Number.isFinite(primary_property_value) ? primary_property_value : 0;
  const safePaddingStart = Number.isFinite(padding_start_value) ? padding_start_value : 0;
  const safePaddingEnd = Number.isFinite(padding_end_value) ? padding_end_value : 0;
  const safeMarginStart = Number.isFinite(margin_start_value) ? margin_start_value : 0;
  const safeMarginEnd = Number.isFinite(margin_end_value) ? margin_end_value : 0;
  const safeBorderStart = Number.isFinite(border_width_start_value) ? border_width_start_value : 0;
  const safeBorderEnd = Number.isFinite(border_width_end_value) ? border_width_end_value : 0;

  return {
    delay,
    duration,
    easing,
    css: (t) =>
      "overflow: hidden;" +
      `opacity: ${Math.min(t * 20, 1) * opacity};` +
      `${primary_property}: ${t * safePrimary}px;` +
      `padding-${startPropLower}: ${t * safePaddingStart}px;` +
      `padding-${endPropLower}: ${t * safePaddingEnd}px;` +
      `margin-${startPropLower}: ${t * safeMarginStart}px;` +
      `margin-${endPropLower}: ${t * safeMarginEnd}px;` +
      `border-${startPropLower}-width: ${t * safeBorderStart}px;` +
      `border-${endPropLower}-width: ${t * safeBorderEnd}px;` +
      "min-height: 0;",
  };
}
