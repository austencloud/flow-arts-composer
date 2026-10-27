/**
 * Deciding when the option picker's first measurement is trustworthy.
 *
 * Choosing a start placement expands the workspace, and StandardWorkspaceLayout
 * eases its grid columns on the dramatic motion interval. The picker mounts before that
 * ease has run a frame, so measuring immediately reports the panel at its
 * PRE-expansion width — wide enough to commit to the 8-column desktop grid
 * inside a panel about to be half that, which then swaps to the swipe layout
 * half a second later, moving the option the user was already reaching for.
 *
 * "Have two frames agreed?" cannot tell arrived from not-started-yet: a CSS
 * transition does not advance until a frame is produced, and preparing the
 * first batch of options keeps frames from being produced. Measured live, the
 * layout's grid-template-columns transition sat at currentTime 0 while the
 * picker opened. So ask the transition itself instead of guessing from widths.
 *
 * The PanelGroup also says so itself: from the update that changes an
 * allocation until its track comes to rest, its root carries
 * `data-panel-motion`, before a transition has been registered and while one
 * is held. Either signal keeps the picker waiting, and no cap that counts from
 * mount may cut that wait short: a cold first load can stop producing frames
 * for seconds with the slide frozen at its start, and committing there drew
 * the desktop catalog, then swapped it for the swipe layout, so the opening
 * arrival played twice.
 */

import { isInMovingPanelGroup } from "#lib/shared/panels/panel-motion.js";

/**
 * Transitions that move a box. A decorative colour or opacity ease overhead
 * must never hold the picker back, so the wait is limited to these.
 */
export const LAYOUT_TRANSITION_PROPERTIES: ReadonlySet<string> = new Set([
  "grid-template-columns",
  "grid-template-rows",
  "width",
  "height",
  "inline-size",
  "block-size",
  "flex",
  "flex-basis",
  "gap",
  "column-gap",
  "row-gap",
]);

/** The parts of a CSSTransition this decision needs. */
export interface TransitionLike {
  readonly transitionProperty?: string;
  readonly playState: string;
  readonly effect: { readonly target?: Element | null } | null;
}

/**
 * True while a strict ancestor of `element` is running a transition that
 * changes the element's own box. A transition on the element itself is not
 * counted: its box is the thing being measured, not something moving it.
 */
export function hasPendingAncestorLayoutTransition(
  element: Element,
  animations: readonly TransitionLike[]
): boolean {
  return animations.some((animation) => {
    const property = animation.transitionProperty;
    // Only CSS transitions carry transitionProperty; keyframe animations do not.
    if (!property || !LAYOUT_TRANSITION_PROPERTIES.has(property)) return false;
    if (animation.playState === "finished" || animation.playState === "idle")
      return false;
    const target = animation.effect?.target;
    // Duck-typed rather than `instanceof Element`: the same check has to hold
    // for nodes from another realm, which jsdom hands tests.
    if (!target || target === element) return false;
    return typeof target.contains === "function" && target.contains(element);
  });
}

/**
 * True while something above `element` is still changing its box: its
 * PanelGroup is mid-slide, or an ancestor's layout transition is running or
 * queued.
 */
export function isAncestorResizing(
  element: Element,
  animations: readonly TransitionLike[]
): boolean {
  return (
    isInMovingPanelGroup(element) ||
    hasPendingAncestorLayoutTransition(element, animations)
  );
}

export interface ContainerSettleInput {
  readonly width: number;
  readonly height: number;
  /** The previous frame's box, or null on the first probe. */
  readonly previous: { width: number; height: number } | null;
  readonly ancestorResizing: boolean;
  /** Time since the probe's first frame, not since mount. */
  readonly elapsedMs: number;
  /** How long a box that keeps changing with nothing above it moving may wait. */
  readonly timeoutMs: number;
  /** How long a resize above that never reports settling may hold it back. */
  readonly resizingTimeoutMs: number;
}

/**
 * Whether this frame's box may be committed as the picker's opening size.
 *
 * Never while something above is still resizing: the box is not the one the
 * picker will live in. Only `resizingTimeoutMs` ends that wait, for a resize
 * that never reports settling (a transition restarted every frame). Otherwise
 * the box commits once it has held still for a frame, or after `timeoutMs` if
 * it keeps changing on its own. The resize observer corrects whatever a cap
 * commits.
 */
export function shouldCommitContainerSize({
  width,
  height,
  previous,
  ancestorResizing,
  elapsedMs,
  timeoutMs,
  resizingTimeoutMs,
}: ContainerSettleInput): boolean {
  if (width <= 100 || height <= 100) return false;
  if (ancestorResizing) return elapsedMs > resizingTimeoutMs;
  if (elapsedMs > timeoutMs) return true;
  return (
    previous !== null &&
    Math.abs(previous.width - width) < 0.5 &&
    Math.abs(previous.height - height) < 0.5
  );
}
