/**
 * Deciding when the option picker's first measurement is trustworthy.
 *
 * Choosing a start placement expands the workspace, and StandardWorkspaceLayout
 * eases its grid columns over 450ms to do it. The picker mounts before that
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
 */

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

export interface ContainerSettleInput {
  readonly width: number;
  readonly height: number;
  /** The previous frame's box, or null on the first probe. */
  readonly previous: { width: number; height: number } | null;
  readonly ancestorTransitionPending: boolean;
  readonly elapsedMs: number;
  readonly timeoutMs: number;
}

/**
 * Whether this frame's box may be committed as the picker's opening size.
 *
 * Committed when the box is measurable AND either it has held still for a
 * frame with nothing above it still resizing, or the cap has expired. The cap
 * keeps a box that never settles — an ancestor transition restarted every
 * frame, a drag-resize still being held — from leaving the panel blank; the
 * resize observer corrects whatever it commits.
 */
export function shouldCommitContainerSize({
  width,
  height,
  previous,
  ancestorTransitionPending,
  elapsedMs,
  timeoutMs,
}: ContainerSettleInput): boolean {
  if (width <= 100 || height <= 100) return false;
  if (elapsedMs > timeoutMs) return true;
  const steady =
    previous !== null &&
    Math.abs(previous.width - width) < 0.5 &&
    Math.abs(previous.height - height) < 0.5;
  return steady && !ancestorTransitionPending;
}
