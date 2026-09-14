/** A measured box, in CSS pixels. */
interface Size {
  width: number;
  height: number;
}

export interface ContainModel {
  cols: number;
  gridHeightUnits: number;
  headerUnits: number;
  footerUnits: number;
  headerMinPx: number;
}

/**
 * The box the Card's host pane is heading toward during a structural change.
 * Structurally identical to the viewer's pane box, restated here so the Card's
 * sizing owner does not depend on the sequence viewer.
 */
export interface ChoreoCardMotionBox {
  width: number;
  height: number;
}

export interface ChoreoCardSizingDeps {
  readonly containerElement: HTMLDivElement | undefined;
  readonly previewStackElement: HTMLDivElement | undefined;
  readonly previewAspectRatio: number;
  readonly forceContain: boolean;
  readonly needsScroll: boolean;
  readonly fitWidth: boolean;
  readonly containSizeMotion: "focus" | "return" | "restore" | null;
  readonly containMotionBox: ChoreoCardMotionBox | null;
  readonly containModel: ContainModel;
  /** Fit a square-cell grid inside a separately fixed outer card ratio. */
  readonly squareGridContain?: boolean;
}

/**
 * Resolve the largest square cell that fits both axes of a fixed-ratio card.
 * Header and footer scale with the cell; the on-screen header floor is solved
 * separately when it is taller than the proportional allocation.
 */
export function fitSquareGridCell(size: Size, model: ContainModel): number {
  if (
    !(size.width > 0) ||
    !(size.height > 0) ||
    !(model.cols > 0) ||
    !(model.gridHeightUnits > 0)
  ) {
    return 0;
  }

  const widthBound = size.width / model.cols;
  const proportionalHeightUnits =
    model.gridHeightUnits + model.headerUnits + model.footerUnits;
  let heightBound = size.height / proportionalHeightUnits;

  if (
    model.headerMinPx > 0 &&
    model.headerUnits > 0 &&
    heightBound * model.headerUnits < model.headerMinPx
  ) {
    const flexibleHeightUnits = model.gridHeightUnits + model.footerUnits;
    heightBound =
      flexibleHeightUnits > 0
        ? (size.height - model.headerMinPx) / flexibleHeightUnits
        : 0;
  }

  return Math.max(0, Math.min(widthBound, heightBound));
}

/**
 * Owns the DOM measurement lifecycle for a ChoreoCard instance.
 *
 * Keeping both ResizeObservers and the aspect-fit calculation together makes
 * container measurements a one-way input to layout instead of scattering DOM
 * reads through the cell renderer and transition controller.
 */
/**
 * Smallest container a structural transition can hand the Card and still be
 * measured from.
 *
 * Mid-transition the Card can be mounted behind a track that is briefly a
 * sliver of its destination. Solving the contained box against that sliver
 * paints a pencil-thin Card for a frame. Below this floor the last measured
 * box is held instead; above it the box keeps following the container, so the
 * width and height transitions carry it to the destination.
 */
const MIN_MEASURABLE_MOTION_SIZE = 240;

/**
 * Largest plausible chrome between the host pane and the Card's own content
 * box. The inset is learned from a settled frame; this caps what a stray
 * measurement can teach it.
 */
const MAX_MOTION_BOX_INSET = 64;

/**
 * How much smaller than its destination a container may be and still count as
 * settled. Chrome between the pane and the Card's box is a percent or two of
 * the pane; a pane that is still easing open is far below this.
 */
const SETTLED_CONTAINER_RATIO = 0.92;

function clampInset(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(value, MAX_MOTION_BOX_INSET);
}

export function createChoreoCardSizingState(
  getDeps: () => ChoreoCardSizingDeps
) {
  let containedWidth = $state<number | null>(null);
  let containedHeight = $state<number | null>(null);
  let containerWidth = $state(0);
  let containerHeight = $state(0);
  let cellWidth = $state(0);
  let cellWidthSuppressed = false;
  let flipSuppressed = $state(false);
  let containerWasZero = false;
  let flipTimer: ReturnType<typeof setTimeout> | null = null;
  let sizeJump = $state(false);
  let jumpFrame: number | null = null;
  // Chrome between the host pane's box and the Card's content box (padding and
  // borders on the panes in between). Learned from settled frames so the
  // destination solve does not need to know the host's markup.
  let motionBoxInsetWidth = 0;
  let motionBoxInsetHeight = 0;
  // The same learned chrome, measured against the container box rather than
  // the content box, so the layout pickers can be aimed at the destination too.
  let containerBoxInsetWidth = 0;
  let containerBoxInsetHeight = 0;
  // The container box the layout pickers should solve against while the pane
  // is still opening. Null whenever the live measurement is the truth.
  let motionContainerWidth = $state<number | null>(null);
  let motionContainerHeight = $state<number | null>(null);
  // Whether this host supplies pane destinations at all. It separates "the
  // pane is collapsing away, so there is no box to aim at" from "this host
  // never had one", which are different situations with different answers.
  let sawMotionBox = false;

  /**
   * The width and height the Card is currently painted at.
   *
   * A transition that was interrupted mid-flight leaves the painted box far
   * from the box state believes in, and it is the painted box the next
   * transition would animate out of.
   */
  function paintedStackSize(): Size | null {
    const stack = getDeps().previewStackElement;
    if (!stack) return null;
    const rect = stack.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }

  /**
   * Paints the next contained box without a transition.
   *
   * Svelte applies the flag and the new dimensions in one DOM commit, so the
   * after-change style already carries `transition: none` and no transition
   * starts. Two frames later the flag clears and ordinary size motion resumes.
   */
  function requestSizeJump(): void {
    if (jumpFrame !== null) cancelAnimationFrame(jumpFrame);
    sizeJump = true;
    jumpFrame = requestAnimationFrame(() => {
      jumpFrame = requestAnimationFrame(() => {
        jumpFrame = null;
        sizeJump = false;
      });
    });
  }

  /**
   * `measured` carries the size a ResizeObserver already computed for us.
   *
   * Reading clientWidth/clientHeight here is a synchronous layout read, and it
   * lands first in the callback, so it absorbs the whole forced-reflow cost of
   * whatever styles changed to trigger the resize. A Chrome trace of the Post
   * Studio blamed this function for 210ms of forced reflow across six seconds.
   * The observer entry already has the number, measured at observation time for
   * free, so the hot path hands it in and never touches the DOM.
   */
  function captureContainerDimensions(measured?: Size): void {
    const container = getDeps().containerElement;
    if (!container) return;
    const width = measured?.width ?? container.clientWidth;
    const height = measured?.height ?? container.clientHeight;
    if (width > 0 && Math.abs(width - containerWidth) > 0.5) {
      containerWidth = width;
    }
    if (height > 0 && Math.abs(height - containerHeight) > 0.5) {
      containerHeight = height;
    }
  }

  /**
   * `content` is the observer entry's contentRect, which is the content box —
   * exactly what the getComputedStyle arithmetic below reconstructs by hand.
   * Taking it directly skips a style recalc and two more layout reads on the
   * resize path. The manual path stays for the effect-driven calls, which have
   * no entry to draw on.
   */
  function updateContainedDimensions(content?: Size): void {
    const deps = getDeps();
    const container = deps.containerElement;
    const aspectRatio = deps.previewAspectRatio;
    if (!container || !aspectRatio || !Number.isFinite(aspectRatio)) return;

    let availableWidth: number;
    let availableHeight: number;
    if (content) {
      availableWidth = content.width;
      availableHeight = content.height;
    } else {
      const style = getComputedStyle(container);
      availableWidth =
        container.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight);
      availableHeight =
        container.clientHeight -
        parseFloat(style.paddingTop) -
        parseFloat(style.paddingBottom);
    }

    const destination = deps.containMotionBox;
    const hasDestination =
      destination !== null && destination.width > 0 && destination.height > 0;

    // Studio borrows this same Card but no longer supplies a viewer destination.
    // Release the grid picker's old box too, or it keeps choosing a portrait
    // layout even after the Card has landed in the wide phone slot.
    if (!hasDestination && deps.containSizeMotion === null) {
      motionContainerWidth = null;
      motionContainerHeight = null;
    }

    // Whether the host pane has reached the box it is heading toward. Decided
    // from geometry rather than from the motion flag, because the incoming
    // Card can mount after the flag has cleared and still find a sliver.
    const paneStillOpening =
      hasDestination &&
      (containerWidth < destination.width * SETTLED_CONTAINER_RATIO ||
        containerHeight < destination.height * SETTLED_CONTAINER_RATIO);

    if (
      hasDestination &&
      deps.containSizeMotion === null &&
      !paneStillOpening
    ) {
      // A settled frame: the container is where the destination said it would
      // be, so the difference between them is the host's chrome.
      if (availableWidth > 0 && availableHeight > 0) {
        motionBoxInsetWidth = clampInset(destination.width - availableWidth);
        motionBoxInsetHeight = clampInset(destination.height - availableHeight);
      }
      if (containerWidth > 0 && containerHeight > 0) {
        containerBoxInsetWidth = clampInset(destination.width - containerWidth);
        containerBoxInsetHeight = clampInset(
          destination.height - containerHeight
        );
      }
      motionContainerWidth = null;
      motionContainerHeight = null;
    }

    if (hasDestination) sawMotionBox = true;

    // Measured whenever a destination is on hand, not only while the motion
    // flag is set: the incoming Card can mount after that flag has cleared,
    // and it is still a speck that must be placed rather than flown.
    const paintedBefore: Size | null = hasDestination
      ? paintedStackSize()
      : null;
    if (
      hasDestination &&
      (deps.containSizeMotion !== null || paneStillOpening)
    ) {
      // The pane's flex allocation animates from nothing, so its live geometry
      // describes where the Card is, not where it is going. Solve against the
      // endpoint instead, so the Card renders at final size for the whole
      // structural change rather than inflating along with its container.
      availableWidth = Math.max(0, destination.width - motionBoxInsetWidth);
      availableHeight = Math.max(0, destination.height - motionBoxInsetHeight);
      // The grid picker chooses columns and start placement from the container
      // box. Left on the live measurement it picks a wide, shallow grid for the
      // sliver the pane starts as, and that grid is what gets remembered as the
      // Card's readable shape. Aim it at the destination as well.
      motionContainerWidth = Math.max(
        0,
        destination.width - containerBoxInsetWidth
      );
      motionContainerHeight = Math.max(
        0,
        destination.height - containerBoxInsetHeight
      );
    } else if (deps.containSizeMotion !== null && sawMotionBox) {
      // The pane is collapsing away, so it has no destination box. Hold the
      // painted Card and let the closing pane clip it. Shrinking it toward
      // nothing leaves a speck behind for its next entrance to grow out of.
      return;
    } else if (
      deps.containSizeMotion !== null &&
      containedWidth !== null &&
      containedHeight !== null &&
      availableWidth > 0 &&
      availableHeight > 0 &&
      (availableWidth < MIN_MEASURABLE_MOTION_SIZE ||
        availableHeight < MIN_MEASURABLE_MOTION_SIZE)
    ) {
      // No destination to aim at, and the track has not opened yet. Hold the
      // painted box rather than solving against the sliver; the next
      // measurement above the floor resumes toward the real destination.
      return;
    }

    if (availableWidth === 0 || availableHeight === 0) {
      containerWasZero = true;
      // A structural transition can briefly measure a mounted pane at zero.
      // Keep the last painted card through that frame; clearing its dimensions
      // makes the whole card collapse before the next ResizeObserver delivery.
      return;
    }

    const revealedFromZero = containerWasZero;
    containerWasZero = false;

    if (deps.needsScroll) {
      containedWidth = null;
      containedHeight = null;
      return;
    }

    let nextWidth: number | null;
    let nextHeight: number | null;
    const containerRatio = availableWidth / availableHeight;

    if (deps.forceContain && deps.fitWidth) {
      const heightFromWidth = availableWidth / aspectRatio;
      // Focus motion used to skip this clamp because the only height on hand
      // was the small one the Card was leaving. With a destination box the
      // height is the one it is arriving at, so the clamp is correct again --
      // without it the Card overshoots past the bottom of the focused pane.
      if (
        (hasDestination || deps.containSizeMotion !== "focus") &&
        Number.isFinite(heightFromWidth) &&
        heightFromWidth > availableHeight
      ) {
        nextHeight = availableHeight;
        const widthFromHeight = availableHeight * aspectRatio;
        nextWidth = Number.isFinite(widthFromHeight) ? widthFromHeight : null;
      } else {
        nextWidth = availableWidth;
        nextHeight = Number.isFinite(heightFromWidth) ? heightFromWidth : null;
      }
    } else if (aspectRatio > containerRatio) {
      nextWidth = availableWidth;
      const heightFromWidth = availableWidth / aspectRatio;
      nextHeight = Number.isFinite(heightFromWidth) ? heightFromWidth : null;
    } else {
      nextHeight = availableHeight;
      const widthFromHeight = availableHeight * aspectRatio;
      nextWidth = Number.isFinite(widthFromHeight) ? widthFromHeight : null;
    }

    // The header has a pixel floor on screen. Re-solve the box when the
    // proportional model would allocate less than that floor so grid rows do
    // not lose height and clip at the bottom.
    const model = deps.containModel;
    if (nextWidth != null && model.headerMinPx > 0) {
      const modeledHeaderPx = (nextWidth / model.cols) * model.headerUnits;
      if (modeledHeaderPx < model.headerMinPx) {
        const perWidthUnits =
          (model.gridHeightUnits + model.footerUnits) / model.cols;
        const width = Math.max(
          0,
          Math.min(
            availableWidth,
            (availableHeight - model.headerMinPx) / perWidthUnits
          )
        );
        nextWidth = width;
        nextHeight = model.headerMinPx + width * perWidthUnits;
      }
    }

    if (
      nextWidth === null ||
      nextHeight === null ||
      nextWidth < 1 ||
      nextHeight < 1
    ) {
      containerWasZero = true;
      return;
    }

    const widthChanged =
      nextWidth !== containedWidth &&
      (nextWidth === null ||
        containedWidth === null ||
        Math.abs(nextWidth - containedWidth) > 0.5);
    const heightChanged =
      nextHeight !== containedHeight &&
      (nextHeight === null ||
        containedHeight === null ||
        Math.abs(nextHeight - containedHeight) > 0.5);

    // Growing a speck into a full Card reads as a burst from nowhere. There was
    // no readable Card to animate from, so place it rather than fly it.
    //
    // The comparison is against the painted box, not the stored one. An
    // interrupted exit can leave the Card painted at a few pixels while its
    // stored size still says otherwise, and that is the case that bursts: the
    // dimensions never change, so only killing the running transition stops it.
    if (paintedBefore !== null) {
      const unreadableBefore =
        paintedBefore.width < MIN_MEASURABLE_MOTION_SIZE ||
        paintedBefore.height < MIN_MEASURABLE_MOTION_SIZE;
      if (unreadableBefore && nextWidth > paintedBefore.width * 2) {
        requestSizeJump();
      }
    } else if (
      (widthChanged || heightChanged) &&
      (containedWidth === null || containedHeight === null)
    ) {
      requestSizeJump();
    }

    if (widthChanged) containedWidth = nextWidth;
    if (heightChanged) containedHeight = nextHeight;

    if (revealedFromZero) {
      flipSuppressed = true;
      requestAnimationFrame(() => {
        updateCellWidth();
        requestAnimationFrame(() => {
          flipSuppressed = false;
        });
      });
    }
  }

  function updateCellWidth(measuredSize?: Size): void {
    if (cellWidthSuppressed) return;
    const deps = getDeps();
    const widthUnits = deps.containModel.cols;
    const stack = deps.previewStackElement;
    if (!stack || widthUnits <= 0) return;
    let stackSize = measuredSize;
    if (!stackSize) {
      // clientWidth/clientHeight include the striped frame padding. The first
      // synchronous measurement happens before ResizeObserver's content-box
      // delivery, so remove that padding here as well or the grid and footer
      // overflow a fixed-aspect card until another resize happens.
      const style = getComputedStyle(stack);
      const horizontalPadding =
        parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const verticalPadding =
        parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      stackSize = {
        width: stack.clientWidth - horizontalPadding,
        height: stack.clientHeight - verticalPadding,
      };
    }
    if (stackSize.width < 1 || stackSize.height < 1) return;
    const nextCellWidth = deps.squareGridContain
      ? fitSquareGridCell(stackSize, deps.containModel)
      : Number.isFinite(stackSize.width / widthUnits)
        ? stackSize.width / widthUnits
        : 0;
    if (Math.abs(nextCellWidth - cellWidth) > 0.5) {
      cellWidth = nextCellWidth;
    }
  }

  function setCellWidthSuppressed(suppressed: boolean): void {
    cellWidthSuppressed = suppressed;
  }

  function setFlipSuppressed(suppressed: boolean): void {
    if (flipTimer !== null) {
      clearTimeout(flipTimer);
      flipTimer = null;
    }
    flipSuppressed = suppressed;
  }

  function suppressFlipFor(durationMs: number): void {
    setFlipSuppressed(true);
    flipTimer = setTimeout(() => {
      flipTimer = null;
      flipSuppressed = false;
    }, durationMs);
  }

  $effect(() => {
    const container = getDeps().containerElement;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const rect = entries[entries.length - 1]?.contentRect;
      const size = rect
        ? { width: rect.width, height: rect.height }
        : undefined;
      captureContainerDimensions(size);
      updateContainedDimensions(size);
    });
    observer.observe(container);
    captureContainerDimensions();
    updateContainedDimensions();
    return () => observer.disconnect();
  });

  $effect(() => {
    const deps = getDeps();
    void deps.previewAspectRatio;
    void deps.forceContain;
    void deps.needsScroll;
    void deps.fitWidth;
    void deps.containSizeMotion;
    void deps.containMotionBox;
    updateContainedDimensions();
  });

  $effect(() => {
    const stack = getDeps().previewStackElement;
    if (!stack) return;

    const observer = new ResizeObserver((entries) => {
      const rect = entries[entries.length - 1]?.contentRect;
      updateCellWidth(
        rect ? { width: rect.width, height: rect.height } : undefined
      );
    });
    observer.observe(stack);
    updateCellWidth();
    return () => observer.disconnect();
  });

  $effect(() => {
    return () => {
      if (flipTimer !== null) clearTimeout(flipTimer);
      if (jumpFrame !== null) cancelAnimationFrame(jumpFrame);
    };
  });

  return {
    get containedWidth() {
      return containedWidth;
    },
    get containedHeight() {
      return containedHeight;
    },
    get containerWidth() {
      return motionContainerWidth ?? containerWidth;
    },
    get containerHeight() {
      return motionContainerHeight ?? containerHeight;
    },
    get cellWidth() {
      return cellWidth;
    },
    get sizeJump() {
      return sizeJump;
    },
    get flipSuppressed() {
      // The Card surface already owns the workspace resize. Letting its cells
      // FLIP against page-space measurements at the same time makes them hover
      // in the old pane, then race and snap back into the moving Card.
      return flipSuppressed || getDeps().containSizeMotion !== null;
    },
    captureContainerDimensions,
    updateContainedDimensions,
    updateCellWidth,
    setCellWidthSuppressed,
    setFlipSuppressed,
    suppressFlipFor,
  } as const;
}
