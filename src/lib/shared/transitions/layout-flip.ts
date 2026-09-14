/**
 * layout-flip — FLIP for a container that recomposes.
 *
 * One owner for "this surface glides from its old layout to its new one".
 * Capture every tracked element's rectangle BEFORE the DOM updates, then play
 * after: each element starts from where it used to be and eases to where it
 * now is, so a delete, a column-count change, or a mode switch reads as
 * movement instead of a snap.
 *
 * Two things it does that `svelte/animate`'s `flip` cannot:
 *
 * 1. It scales x and y independently, so a cell whose aspect ratio changes
 *    (a timeline cell widening by its duration multiplier, a grid cell
 *    reflowing into a shorter row) travels without distorting.
 * 2. It spans element families that live in different keyed blocks — or in no
 *    keyed block at all — so step cells, the start tile, and the mandala cells
 *    all move on one clock.
 *
 * Capture reads each rectangle BEFORE cancelling any animation still running on
 * it, so an interrupted transition chains from the position it had reached
 * rather than jumping to its destination first.
 */

import { DURATION } from "./transitions";

/** The clock every multi-element layout recomposition runs on. */
export const LAYOUT_MOTION_DURATION_MS = DURATION.emphasis;
export const LAYOUT_MOTION_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";

/** @deprecated Use LAYOUT_MOTION_DURATION_MS. */
export const GRID_LAYOUT_TRANSITION_MS = LAYOUT_MOTION_DURATION_MS;
/** @deprecated Use LAYOUT_MOTION_EASING. */
export const GRID_LAYOUT_TRANSITION_EASING = LAYOUT_MOTION_EASING;

/** Below these a move is invisible and not worth an animation. */
const MIN_TRANSLATE_PX = 0.5;
const MIN_SCALE_DELTA = 0.005;

export interface LayoutMotionGroup {
  /** Attribute selector matching the family, e.g. `[data-history-step-identity]`. */
  selector: string;
  /** `dataset` property holding each member's stable key. */
  datasetKey: string;
}

export interface LayoutMotionConfig {
  getRoot: () => HTMLElement | null | undefined;
  groups: LayoutMotionGroup[];
  /**
   * Descendants whose in-flight animations are cancelled on capture, so a
   * second transition doesn't stack on top of a first.
   */
  cancelSelectors?: string[];
  /**
   * Mark the root while geometry owns the gesture. Descendants can use the
   * attribute to pause their own transitions so, for example, an SVG does not
   * rotate inside a tile that is simultaneously translating and scaling.
   */
  suspendDescendantTransitions?: boolean;
  /** Reduced-motion-aware duration in ms. 0 disables the transition. */
  getDuration?: () => number;
  easing?: string;
  /** Controls keep their physical size while the surrounding row changes width.
   * Use only on explicitly sized boxes; artwork keeps the default scale flight. */
  resize?: "scale" | "layout";
}

export interface LayoutMotion {
  /** Snapshot current geometry. Returns false when there is nothing to track. */
  capture(): boolean;
  /** Animate from the snapshot to current geometry. Consumes the snapshot. */
  play(): Animation[];
  /** Drop a snapshot without playing it. */
  discard(): void;
  /** Cancel anything this instance is currently animating. */
  cancel(): void;
  readonly hasCapture: boolean;
}

function collectMembers(
  root: HTMLElement,
  groups: LayoutMotionGroup[]
): Map<string, HTMLElement> {
  const members = new Map<string, HTMLElement>();
  groups.forEach((group, groupIndex) => {
    for (const element of root.querySelectorAll<HTMLElement>(group.selector)) {
      const key = element.dataset[group.datasetKey];
      // A group whose members carry no key (the lone start tile) still needs a
      // stable identity — the selector itself is unique enough for a singleton.
      members.set(`${groupIndex}:${key ?? ""}`, element);
    }
  });
  return members;
}

/**
 * A keyframe animation on a descendant is that descendant's OWN gesture — the
 * entrance bloom a cell plays as it arrives. Only transitions (and the flip's
 * own transforms) can stack with a layout move, so only those get cancelled.
 * Cancelling entrances instead stranded the start tile invisible for a whole
 * generation: its bloom died on capture, `animationend` never fired, and the
 * cell stayed at `opacity: 0` until the sequence animation cleaned up.
 */
function isKeyframeAnimation(animation: Animation): boolean {
  return typeof (animation as CSSAnimation).animationName === "string";
}

function cancelMemberAnimations(
  element: HTMLElement,
  cancelSelectors: string[]
): void {
  for (const animation of element.getAnimations()) animation.cancel();
  for (const selector of cancelSelectors) {
    const target = element.querySelector<HTMLElement>(selector);
    if (!target) continue;
    for (const animation of target.getAnimations()) {
      if (isKeyframeAnimation(animation)) continue;
      animation.cancel();
    }
  }
}

/**
 * The transform lands on the tracked element itself, never on a descendant.
 * A cell's background, border, and selection ring belong to its outer box; move
 * only the inside and the box arrives instantly, leaving its contents to slide
 * over an already-parked square.
 */
function animateGeometry(
  element: HTMLElement,
  beforeRect: DOMRect,
  duration: number,
  easing: string,
  resize: "scale" | "layout"
): Animation | null {
  if (duration <= 0) return null;

  const afterRect = element.getBoundingClientRect();
  const deltaX = beforeRect.left - afterRect.left;
  const deltaY = beforeRect.top - afterRect.top;
  const scaleX = afterRect.width > 0 ? beforeRect.width / afterRect.width : 1;
  const scaleY =
    afterRect.height > 0 ? beforeRect.height / afterRect.height : 1;

  const moved =
    Math.abs(deltaX) > MIN_TRANSLATE_PX ||
    Math.abs(deltaY) > MIN_TRANSLATE_PX ||
    Math.abs(scaleX - 1) > MIN_SCALE_DELTA ||
    Math.abs(scaleY - 1) > MIN_SCALE_DELTA;
  if (!moved) return null;

  const frames: Keyframe[] =
    resize === "layout"
      ? [
          {
            transform: `translate(${deltaX}px, ${deltaY}px)`,
            width: `${beforeRect.width}px`,
            height: `${beforeRect.height}px`,
          },
          {
            // Omit size at the final keyframe: its neutral value is the live
            // underlying width/height. A reparenting host can keep updating
            // those while its own track opens, without a stale pixel endpoint
            // overriding it and snapping when this animation is removed.
            transform: "none",
          },
        ]
      : [
          {
            transformOrigin: "top left",
            transform: `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`,
          },
          { transformOrigin: "top left", transform: "none" },
        ];
  const animation = element.animate(frames, { duration, easing, fill: "both" });
  // fill: "both" holds the final frame, which would pin a `transform: none`
  // onto the element forever and defeat the next transition's measurement.
  animation.onfinish = () => animation.cancel();
  return animation;
}

export function createLayoutMotion(config: LayoutMotionConfig): LayoutMotion {
  const {
    getRoot,
    groups,
    cancelSelectors = [],
    suspendDescendantTransitions = false,
    getDuration = () => LAYOUT_MOTION_DURATION_MS,
    easing = LAYOUT_MOTION_EASING,
    resize = "scale",
  } = config;

  let snapshot: Map<string, DOMRect> | null = null;
  let running: Animation[] = [];
  let suspendedRoot: HTMLElement | null = null;
  let suspensionToken = 0;

  function beginDescendantSuspension(root: HTMLElement): number {
    const token = ++suspensionToken;
    suspendedRoot?.removeAttribute("data-layout-motion-suspend-descendants");
    suspendedRoot = root;
    root.setAttribute("data-layout-motion-suspend-descendants", "");
    return token;
  }

  function endDescendantSuspension(expectedToken?: number): void {
    if (expectedToken !== undefined && expectedToken !== suspensionToken) {
      return;
    }
    suspendedRoot?.removeAttribute("data-layout-motion-suspend-descendants");
    suspendedRoot = null;
  }

  function cancel(): void {
    ++suspensionToken;
    for (const animation of running) animation.cancel();
    running = [];
    endDescendantSuspension();
  }

  return {
    get hasCapture() {
      return snapshot !== null;
    },

    capture(): boolean {
      snapshot = null;

      const root = getRoot();
      // Nothing is being measured on these paths, so there is no mid-flight
      // position to preserve — drop whatever is running.
      if (!root || getDuration() <= 0) {
        cancel();
        return false;
      }

      const members = collectMembers(root, groups);
      if (members.size === 0) {
        cancel();
        return false;
      }

      const rects = new Map<string, DOMRect>();
      for (const [key, element] of members) {
        // Rect first, then cancel — and never a blanket cancel ahead of the
        // loop, which would snap an in-flight transition to its destination
        // before it was measured. An interrupted transition has to chain from
        // the position it had actually reached on screen.
        rects.set(key, element.getBoundingClientRect());
        cancelMemberAnimations(element, cancelSelectors);
      }
      // The loop above cancelled everything this instance had running.
      running = [];

      snapshot = rects;
      if (suspendDescendantTransitions) {
        beginDescendantSuspension(root);
      }
      return true;
    },

    play(): Animation[] {
      const rects = snapshot;
      snapshot = null;
      if (!rects) return [];

      const root = getRoot();
      if (!root) {
        endDescendantSuspension();
        return [];
      }

      const duration = getDuration();
      const members = collectMembers(root, groups);
      const animations: Animation[] = [];

      for (const [key, beforeRect] of rects) {
        const element = members.get(key);
        // Absent members left the layout (a deleted step, a mandala that only
        // exists in the other mode). Nothing to move them to.
        if (!element) continue;
        const animation = animateGeometry(
          element,
          beforeRect,
          duration,
          easing,
          resize
        );
        if (animation) animations.push(animation);
      }

      running = animations;
      if (suspendDescendantTransitions) {
        const token = suspensionToken;
        if (animations.length === 0) {
          endDescendantSuspension(token);
        } else {
          const unsettled = new Set(animations);
          const settle = (animation: Animation) => {
            if (!unsettled.delete(animation) || unsettled.size > 0) return;
            if (token === suspensionToken) running = [];
            endDescendantSuspension(token);
          };
          for (const animation of animations) {
            animation.addEventListener("finish", () => settle(animation), {
              once: true,
            });
            animation.addEventListener("cancel", () => settle(animation), {
              once: true,
            });
          }
        }
      }
      return animations;
    },

    discard(): void {
      snapshot = null;
      ++suspensionToken;
      endDescendantSuspension();
    },

    cancel,
  };
}

/** @deprecated Use LayoutMotionGroup. */
export type LayoutFlipGroup = LayoutMotionGroup;
/** @deprecated Use LayoutMotionConfig. */
export type LayoutFlipConfig = LayoutMotionConfig;
/** @deprecated Use LayoutMotion. */
export type LayoutFlip = LayoutMotion;
/** @deprecated Use createLayoutMotion. */
export const createLayoutFlip = createLayoutMotion;
