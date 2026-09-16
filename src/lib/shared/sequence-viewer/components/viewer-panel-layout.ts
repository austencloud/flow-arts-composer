export type ViewerPanelDirection = "horizontal" | "vertical";
export type ViewerFocusedPane = "animation" | "image" | null;

export interface ViewerPanelLayoutInput {
  isFullscreen: boolean;
  fullscreenStackVertical: boolean;
  isMobile: boolean;
  isLandscapeMobile: boolean;
  adaptiveVerticalSplit: boolean;
  focusedPane: ViewerFocusedPane;
  practiceActive: boolean;
  practiceCanvasFraction: number;
  /**
   * The animation pane's share of the Side by Side split per axis, as the
   * user dragged it. Focus and Practice still decide their own allocation.
   */
  userSplitShares?: Partial<Record<ViewerPanelDirection, number>>;
}

export interface ViewerPanelLayout {
  direction: ViewerPanelDirection;
  sizes: [number, number];
  previewPreferredSize?: string;
}

interface ViewerPanelDirectionInput {
  responsiveDirection: ViewerPanelDirection;
  retainedSplitDirection: ViewerPanelDirection | null;
  focusedPane: ViewerFocusedPane;
  focusReleasePending: boolean;
}

export const MIN_VIEWER_PANE_REVEAL_SIZE = 240;

/**
 * A focused workspace only has one readable pane, so changing its split axis
 * carries no useful information. Keep the last real Side-by-Side axis through
 * focus and its release; otherwise an outer inspector can make the temporary
 * stage portrait-shaped and turn a horizontal return into a vertical squeeze.
 */
export function resolveViewerPanelDirection(
  input: ViewerPanelDirectionInput
): ViewerPanelDirection {
  if (
    input.retainedSplitDirection &&
    (input.focusedPane !== null || input.focusReleasePending)
  ) {
    return input.retainedSplitDirection;
  }
  return input.responsiveDirection;
}

export function isViewerPaneReadyToReveal(
  _direction: ViewerPanelDirection,
  width: number,
  height: number
): boolean {
  // A panel can have plenty of room along the split axis while an outer dock
  // transition briefly leaves it only a few pixels on the cross axis. Both
  // dimensions must describe a readable surface before its opacity rises.
  return (
    width >= MIN_VIEWER_PANE_REVEAL_SIZE &&
    height >= MIN_VIEWER_PANE_REVEAL_SIZE
  );
}

interface ViewerPaneRevealInput {
  pane: Exclude<ViewerFocusedPane, null>;
  focusedPane: ViewerFocusedPane;
  direction: ViewerPanelDirection;
  width: number;
  height: number;
  /** Available stage bounds, so a genuinely short viewport is still usable. */
  stageWidth?: number;
  stageHeight?: number;
}

/**
 * Selection names the destination, not the current geometry. A rapid focus
 * reversal may still leave the selected pane a sliver for several frames.
 * Reveal it only once there is room, including on short landscape screens.
 */
export function resolveViewerPaneRevealReady(
  input: ViewerPaneRevealInput
): boolean {
  if (input.focusedPane !== null && input.focusedPane !== input.pane)
    return false;
  const threshold = (available?: number) =>
    available !== undefined && available > 0
      ? Math.min(MIN_VIEWER_PANE_REVEAL_SIZE, available * 0.9)
      : MIN_VIEWER_PANE_REVEAL_SIZE;
  return (
    input.width >= threshold(input.stageWidth) &&
    input.height >= threshold(input.stageHeight)
  );
}

function clampFraction(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

/**
 * Resolve the two pane allocations before the workspace moves. Keeping this
 * decision atomic prevents a responsive direction change and a mode change
 * from briefly describing two different layouts to the mounted canvases.
 */
export function resolveViewerPanelLayout(
  input: ViewerPanelLayoutInput
): ViewerPanelLayout {
  if (input.practiceActive) {
    const direction: ViewerPanelDirection =
      input.isMobile && !input.isLandscapeMobile ? "vertical" : "horizontal";
    if (direction === "vertical") {
      return {
        direction,
        sizes: [1, 1],
        previewPreferredSize: "auto",
      };
    }

    const canvasFraction = clampFraction(input.practiceCanvasFraction);
    return {
      direction,
      sizes: [canvasFraction, 1 - canvasFraction],
    };
  }

  const direction: ViewerPanelDirection = input.isFullscreen
    ? input.fullscreenStackVertical
      ? "vertical"
      : "horizontal"
    : input.isLandscapeMobile ||
        (!input.isMobile && !input.adaptiveVerticalSplit)
      ? "horizontal"
      : "vertical";

  if (input.focusedPane === "animation") {
    return { direction, sizes: [1, 0] };
  }

  if (input.focusedPane === "image") {
    return { direction, sizes: [0, 1] };
  }

  const share = input.userSplitShares?.[direction];
  if (share !== undefined && share > 0 && share < 1) {
    return { direction, sizes: [share, 1 - share] };
  }
  return { direction, sizes: [1, 1] };
}

export interface ViewerPaneBox {
  width: number;
  height: number;
}

interface ViewerPaneDestinationInput {
  pane: Exclude<ViewerFocusedPane, null>;
  direction: ViewerPanelDirection;
  sizes: [number, number];
  splitWidth: number;
  splitHeight: number;
}

/**
 * The box a pane is heading toward, derived from the allocation that has
 * already been decided rather than from the pane's live geometry.
 *
 * A focus change swaps the two pane shares between 0 and 1, and CSS animates
 * that swap. A surface that measures its own pane during those frames is
 * measuring a box on its way somewhere, so a Card entering from a collapsed
 * pane solves itself against a sliver and then stretches into place. The
 * shares are known the moment the layout is resolved, and the split container
 * is the only element whose size the focus change does not alter, so the two
 * together describe the destination directly.
 *
 * Returns null when the split has not been measured yet, or when the pane's
 * destination share is zero -- there is no box to aim at in either case.
 */
export function resolveViewerPaneDestinationBox(
  input: ViewerPaneDestinationInput
): ViewerPaneBox | null {
  const { splitWidth, splitHeight, sizes } = input;
  if (!(splitWidth > 0) || !(splitHeight > 0)) return null;

  const total = sizes[0] + sizes[1];
  if (!(total > 0)) return null;

  const share = (input.pane === "animation" ? sizes[0] : sizes[1]) / total;
  if (!(share > 0)) return null;

  return input.direction === "horizontal"
    ? { width: splitWidth * share, height: splitHeight }
    : { width: splitWidth, height: splitHeight * share };
}

/**
 * Boxes the Card's pane has settled at, remembered across split-pane instances.
 *
 * The dual-source crossfade gives the outgoing and incoming views their own
 * split panes, so a component-local memo is empty on exactly the transitions
 * that need it. Geometry a viewport has already produced is not per-instance
 * state, so it lives here instead.
 *
 * The resolved box is remembered rather than the stage and the allocation
 * separately: for the first frames of a mode change the allocation still
 * describes the mode being left, and recombining it with a settled stage
 * produces a box the Card never occupies.
 */
const viewerCardPaneBoxes = new Map<string, ViewerPaneBox>();

/** Enough for both layouts in both orientations across a few viewports. */
const MAX_REMEMBERED_PANE_BOXES = 24;

function cardPaneBoxMemoKey(key: string, vw: number, vh: number): string {
  return `${key}@${vw}x${vh}`;
}

export function rememberViewerCardPaneBox(
  key: string,
  vw: number,
  vh: number,
  box: ViewerPaneBox
): void {
  if (!(box.width > 0) || !(box.height > 0)) return;
  if (viewerCardPaneBoxes.size >= MAX_REMEMBERED_PANE_BOXES) {
    viewerCardPaneBoxes.clear();
  }
  viewerCardPaneBoxes.set(cardPaneBoxMemoKey(key, vw, vh), box);
}

export function readViewerCardPaneBox(
  key: string,
  vw: number,
  vh: number
): ViewerPaneBox | null {
  return viewerCardPaneBoxes.get(cardPaneBoxMemoKey(key, vw, vh)) ?? null;
}

/** Test-only: forget every settled box. */
export function clearViewerCardPaneBoxes(): void {
  viewerCardPaneBoxes.clear();
}

interface ViewerSplitCardPaneBoxInput {
  key: string;
  vw: number;
  vh: number;
  direction: ViewerPanelDirection;
  /** The animation pane's share of the split axis, as the user set it. */
  share: number;
  splitWidth: number;
  splitHeight: number;
}

/**
 * Teach the Card the pane box a user-chosen split share produces, and return
 * that box.
 *
 * The settle timer learns boxes by watching the pane hold still, which is the
 * right source for a mode change. It is the wrong source for the divider: the
 * user has already decided the allocation, and until the timer catches up the
 * memo still holds the box the Card is leaving. When the divider shrinks the
 * Card's pane, that stale wider box reads as "still opening" and the Card
 * solves its grid for a pane it no longer has. Remembering the chosen box the
 * moment the share changes keeps the memo honest for every frame after.
 *
 * Returns null, and leaves the memo alone, while the split is unmeasured.
 */
export function rememberViewerSplitCardPaneBox(
  input: ViewerSplitCardPaneBoxInput
): ViewerPaneBox | null {
  const box = resolveViewerPaneDestinationBox({
    pane: "image",
    direction: input.direction,
    sizes: [input.share, 1 - input.share],
    splitWidth: input.splitWidth,
    splitHeight: input.splitHeight,
  });
  if (box === null) return null;
  rememberViewerCardPaneBox(input.key, input.vw, input.vh, box);
  return box;
}

interface ViewerCardMotionBoxInput {
  /** The box this layout last settled at this viewport, if any. */
  remembered: ViewerPaneBox | null;
  /** The box the Card's pane occupies right now, if the split is measured. */
  live: ViewerPaneBox | null;
  /** Whether the Card's pane is known to be animating. */
  inMotion: boolean;
}

/**
 * A pane this much smaller than its settled box is still opening, whatever
 * the motion flag says.
 */
const CARD_PANE_SETTLED_RATIO = 0.98;

/**
 * The box the Card should solve against: its destination while the pane is
 * on its way somewhere, and its live pane once it has arrived.
 *
 * Before this layout has settled once at this viewport there is nothing to
 * remember. Publishing no destination is better than publishing the box the
 * Card is leaving: that one makes it solve a grid for the wrong shape and
 * correct in public. The ordinary measurement path carries the first entry.
 *
 * A pane measurably smaller than the one this layout settled at is still
 * opening. The incoming Card can mount a frame before the motion flag is set,
 * and a sliver read as a settled measurement is what makes it solve for a
 * speck and then grow.
 */
export function resolveViewerCardMotionBox(
  input: ViewerCardMotionBoxInput
): ViewerPaneBox | null {
  const { remembered, live, inMotion } = input;
  if (remembered === null) return live;
  if (inMotion) return remembered;
  if (live === null) return remembered;
  const stillOpening =
    live.width < remembered.width * CARD_PANE_SETTLED_RATIO ||
    live.height < remembered.height * CARD_PANE_SETTLED_RATIO;
  return stillOpening ? remembered : live;
}
