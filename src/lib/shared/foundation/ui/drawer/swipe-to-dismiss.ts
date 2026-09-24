/**
 * SwipeToDismissHandler - Manages swipe-to-dismiss gesture interactions
 *
 * Handles touch and mouse events for drawer dismissal with threshold-based detection.
 * Prevents conflicts with interactive elements and manages drag state.
 *
 * This is a plain helper class, not an inversify service - instantiated directly by components.
 */

import { createComponentLogger } from "$lib/shared/utils/debug-logger";
import { isTopDrawer, dismissTopDrawer } from "./drawer-stack";

const debug = createComponentLogger("SwipeToDismiss");

/**
 * Swipe-to-dismiss threshold constants
 * These control when a swipe gesture triggers drawer dismissal
 */
const DISMISS_THRESHOLDS = {
  /** Minimum distance (px) for a slow swipe to trigger dismiss */
  DISTANCE_SLOW: 100,
  /** Minimum distance (px) for a fast swipe to trigger dismiss */
  DISTANCE_FAST: 50,
  /** Maximum duration (ms) for a swipe to be considered "fast" */
  FAST_SWIPE_MAX_DURATION: 500,
  /** Minimum movement (px) to consider gesture as intentional drag */
  MOVEMENT_THRESHOLD: 5,
  /**
   * Tap slop (px) for gestures that START on an interactive control (button,
   * link, input). A finger is never perfectly still, so the 5px drag threshold
   * was cancelling real taps: a few px of jitter set `hasMoved`, which set
   * `justDragged`, which made the capture-phase click handler swallow the
   * click. Buttons inside drawers then read as dead on touch devices — the
   * inbox header toggle and the card-export chips both rage-clicked because of
   * it. Only travel along the dismiss axis beyond this slop cancels a tap.
   * 12px matches the touch slop native browsers use.
   */
  TAP_SLOP: 12,
  /**
   * Distance (px) a pull must travel to dismiss when the gesture STARTS at a
   * scrollable container's dismiss edge (e.g. a message list already scrolled to
   * the top). Deliberately larger than DISTANCE_SLOW and velocity-independent so
   * a quick scroll flick at the edge rubber-bands back instead of closing —
   * matching native iOS / Facebook bottom sheets.
   */
  DISTANCE_BOUNDARY: 140,
  /** Resistance applied to the visual drag offset for edge-origin pulls (0-1). */
  RUBBER_BAND_FACTOR: 0.5,
} as const;

export type SwipePlacement = "bottom" | "top" | "right" | "left";

export interface SwipeToDismissOptions {
  placement: SwipePlacement;
  dismissible: boolean;
  onDismiss: () => void;
  /** Called during drag with current state. isDragging=true on start/move, false on end */
  onDragChange?: (
    offset: number,
    progress: number,
    isDragging: boolean
  ) => void;
  /** Called when drag ends with offset, velocity (px/ms), and duration. Return true to prevent default dismiss. */
  onDragEnd?: (offset: number, velocity: number, duration: number) => boolean;
  /** Drawer ID for stack management - only top drawer responds to swipe */
  drawerId?: string;
  /**
   * Ignore a `data-swipe-block` marker above this handler's element. A handler
   * attached inside a blocked region (such as the ControlDock tray) still owns
   * its gestures, while blocked descendants can own their own gestures.
   */
  ignoreSwipeBlock?: boolean;
}

export class SwipeToDismiss {
  private element: HTMLElement | null = null;
  private isDragging = false;
  private startY = 0;
  private currentY = 0;
  private startX = 0;
  private currentX = 0;
  private startTime = 0;
  private hasMoved = false;
  private startedOnInteractive = false;
  private justDragged = false;
  private cleanupFn: (() => void) | null = null;

  // Mouse-specific: defer isDragging until movement exceeds threshold.
  // Touch events start drag immediately for responsive mobile feel.
  // Mouse events wait for intentional movement to avoid stealing clicks.
  private pendingMouseDrag = false;

  // Scroll-aware dismiss: track scrollable container state
  private scrollableContainer: HTMLElement | null = null;
  private scrollAtBoundary = true; // True if scroll is at the edge where dismiss would occur
  // True when THIS gesture began with the scroll container already at its
  // dismiss edge. Such pulls get rubber-band resistance + a higher,
  // velocity-independent dismiss threshold so an accidental scroll flick at the
  // edge springs back instead of closing.
  private startedAtScrollBoundary = false;

  // Delegation flag: when true, this drawer is not the top drawer,
  // so swipe gestures should dismiss the top drawer instead
  private delegatingToTopDrawer = false;

  // Disabled flag: when true, all gesture handling is blocked
  // Used during open/close animations to prevent conflicts
  private disabled = false;

  constructor(private options: SwipeToDismissOptions) {}

  /**
   * Temporarily disable gesture handling (e.g., during animations)
   */
  setDisabled(disabled: boolean) {
    this.disabled = disabled;
    if (disabled && this.isDragging) {
      // Cancel any in-progress drag
      this.isDragging = false;
      this.options.onDragChange?.(0, 1, false);
    }
  }

  /**
   * Find the nearest scrollable ancestor from the touch target
   */
  private findScrollableAncestor(target: HTMLElement): HTMLElement | null {
    let current: HTMLElement | null = target;
    while (current && current !== this.element) {
      // Skip form elements - they have overflow:auto by default but shouldn't block dismiss
      const tagName = current.tagName.toLowerCase();
      if (
        tagName === "textarea" ||
        tagName === "input" ||
        tagName === "select"
      ) {
        current = current.parentElement;
        continue;
      }

      const style = window.getComputedStyle(current);
      const overflowY = style.overflowY;
      const overflowX = style.overflowX;

      // Check if this element is scrollable
      const isScrollableY =
        (overflowY === "auto" || overflowY === "scroll") &&
        current.scrollHeight > current.clientHeight;
      const isScrollableX =
        (overflowX === "auto" || overflowX === "scroll") &&
        current.scrollWidth > current.clientWidth;

      if (isScrollableY || isScrollableX) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  /**
   * Check if scroll is at the boundary where dismiss gesture would occur
   * For bottom placement: scrollTop === 0 (at top)
   * For top placement: scrollTop === maxScroll (at bottom)
   * For right placement: scrollLeft === 0 (at left)
   * For left placement: scrollLeft === maxScroll (at right)
   */
  private isScrollAtDismissBoundary(container: HTMLElement): boolean {
    const { placement } = this.options;

    if (placement === "bottom") {
      // For bottom sheet, dismiss happens on swipe down, which conflicts with scrolling up
      // Only allow dismiss when already at the top (scrollTop === 0)
      return container.scrollTop <= 1; // Allow 1px tolerance
    } else if (placement === "top") {
      // For top sheet, dismiss happens on swipe up, which conflicts with scrolling down
      const maxScroll = container.scrollHeight - container.clientHeight;
      return container.scrollTop >= maxScroll - 1;
    } else if (placement === "right") {
      return container.scrollLeft <= 1;
    } else if (placement === "left") {
      const maxScroll = container.scrollWidth - container.clientWidth;
      return container.scrollLeft >= maxScroll - 1;
    }
    return true;
  }

  /**
   * Attach event listeners to the target element
   */
  attach(element: HTMLElement) {
    this.detach(); // Clean up any previous listeners
    this.element = element;
    debug.log(`attach called for drawer: ${this.options.drawerId}`);

    const handleStart = (e: TouchEvent | MouseEvent) =>
      this.handleTouchStart(e);
    const handleMove = (e: TouchEvent | MouseEvent) => this.handleTouchMove(e);
    const handleEnd = (e: TouchEvent | MouseEvent) => this.handleTouchEnd(e);
    const handleClick = (e: MouseEvent) => this.handleClick(e);

    // Touch events - must all be {passive: false}
    element.addEventListener("touchstart", handleStart, { passive: false });
    element.addEventListener("touchmove", handleMove, { passive: false });
    element.addEventListener("touchend", handleEnd, { passive: false });

    // Mouse events - also need {passive: false}
    element.addEventListener("mousedown", handleStart, { passive: false });
    element.addEventListener("mousemove", handleMove, { passive: false });
    element.addEventListener("mouseup", handleEnd, { passive: false });
    element.addEventListener("mouseleave", handleEnd, { passive: false });

    // Click event - capture phase to intercept before button handlers
    element.addEventListener("click", handleClick, { capture: true });

    this.cleanupFn = () => {
      element.removeEventListener("touchstart", handleStart);
      element.removeEventListener("touchmove", handleMove);
      element.removeEventListener("touchend", handleEnd);
      element.removeEventListener("mousedown", handleStart);
      element.removeEventListener("mousemove", handleMove);
      element.removeEventListener("mouseup", handleEnd);
      element.removeEventListener("mouseleave", handleEnd);
      element.removeEventListener("click", handleClick, true);
    };
  }

  /**
   * Remove event listeners and clean up
   */
  detach() {
    if (this.cleanupFn) {
      this.cleanupFn();
      this.cleanupFn = null;
    }
    this.element = null;
  }

  /**
   * Update options (e.g., when props change)
   */
  updateOptions(options: Partial<SwipeToDismissOptions>) {
    this.options = { ...this.options, ...options };
  }

  /**
   * Get current drag state
   */
  getIsDragging(): boolean {
    return this.isDragging;
  }

  /**
   * Get current drag offset for Y axis
   */
  getDragOffsetY(): number {
    if (!this.isDragging) return 0;
    const delta = this.damp(this.currentY - this.startY);

    if (this.options.placement === "bottom") {
      return Math.max(0, delta); // Only allow downward
    } else if (this.options.placement === "top") {
      return Math.min(0, delta); // Only allow upward
    }
    return 0;
  }

  /**
   * Get current drag offset for X axis
   */
  getDragOffsetX(): number {
    if (!this.isDragging) return 0;
    const delta = this.damp(this.currentX - this.startX);

    if (this.options.placement === "right") {
      return Math.max(0, delta); // Only allow rightward
    } else if (this.options.placement === "left") {
      return Math.min(0, delta); // Only allow leftward
    }
    return 0;
  }

  /**
   * Reset drag state
   */
  reset() {
    this.isDragging = false;
    this.pendingMouseDrag = false;
    this.hasMoved = false;
    this.startedOnInteractive = false;
    // justDragged is intentionally NOT cleared here — it has its own 100ms timeout.
    // Clearing it in reset() causes a race: the drawer close effect calls reset()
    // before the click event fires, allowing the click through to buttons.
    this.delegatingToTopDrawer = false;
    this.startY = 0;
    this.currentY = 0;
    this.startX = 0;
    this.currentX = 0;
    this.scrollableContainer = null;
    this.scrollAtBoundary = true;
    this.startedAtScrollBoundary = false;
  }

  /** Apply overscroll resistance to edge-origin pulls (native rubber-band). */
  private damp(delta: number): number {
    return this.startedAtScrollBoundary
      ? delta * DISMISS_THRESHOLDS.RUBBER_BAND_FACTOR
      : delta;
  }

  private handleTouchStart(event: TouchEvent | MouseEvent) {
    debug.log(`handleTouchStart for drawer: ${this.options.drawerId}`);

    // Block gestures when disabled (e.g., during opening animation)
    if (this.disabled) {
      debug.log("blocked: disabled during animation");
      return;
    }

    if (!this.options.dismissible) {
      debug.log("blocked: not dismissible");
      return;
    }

    // Ignore right-click (context menu) - allow browser default behavior
    if (event instanceof MouseEvent && event.button !== 0) {
      debug.log("blocked: right-click");
      return;
    }

    // Only process if this drawer is the top drawer (prevents nested drawer conflicts)
    // If not the top drawer, don't start tracking at all - let the top drawer handle it
    if (this.options.drawerId && !isTopDrawer(this.options.drawerId)) {
      debug.log("not top drawer, ignoring gesture");
      // Don't track gesture on non-top drawer - the top drawer will handle it
      // This prevents the bug where both parent and child drawers process the same swipe
      return;
    }
    this.delegatingToTopDrawer = false;

    // Bail out entirely for range sliders - dragging a slider thumb must never
    // be interpreted as a swipe-to-dismiss gesture
    const target = event.target as HTMLElement;
    const rangeInput = target.closest('input[type="range"]') as HTMLInputElement | null;
    if (rangeInput) {
      return;
    }

    // Bail out for any ARIA slider (e.g., the segmented progress / scrubber bar).
    // Scrubbing horizontally on the bar would otherwise be read as drawer drag.
    if (target.closest('[role="slider"]')) {
      return;
    }

    // A blocked descendant owns the gesture even when this handler lives under
    // another blocked region. `ignoreSwipeBlock` only exempts markers above the
    // attached element, such as the dock root above its own tray.
    const blockedRegion = target.closest("[data-swipe-block]");
    if (
      blockedRegion &&
      (!this.options.ignoreSwipeBlock || this.element?.contains(blockedRegion))
    ) {
      return;
    }

    // Bail out for canvases that own pointer gestures (e.g., Three.js/Threlte
    // 3D viewer orbit controls). The 2D animation canvas has no drag
    // interaction of its own, so it should pass through to dismiss. Canvases
    // opt in by marking an ancestor with `data-swipe-block`.
    const canvasEl =
      target.tagName === "CANVAS"
        ? (target as HTMLCanvasElement)
        : (target.closest("canvas") as HTMLCanvasElement | null);
    if (canvasEl?.closest("[data-swipe-block]")) {
      return;
    }

    // Track if we started on an interactive element
    this.startedOnInteractive = !!(
      target.closest("button") ||
      target.closest("a") ||
      target.closest("input") ||
      target.closest("select") ||
      target.closest("textarea") ||
      target.closest('[role="button"]')
    );

    // Find scrollable container and check if we're at the dismiss boundary
    this.scrollableContainer = this.findScrollableAncestor(target);
    this.scrollAtBoundary = this.scrollableContainer
      ? this.isScrollAtDismissBoundary(this.scrollableContainer)
      : true;
    // Rubber-band only when there IS scrollable content and we start at its
    // edge. A non-scrollable panel keeps the easy pull-to-dismiss.
    this.startedAtScrollBoundary =
      !!this.scrollableContainer && this.scrollAtBoundary;

    // Desktop Safari does not define the `TouchEvent` global, so a bare
    // `event instanceof TouchEvent` throws ReferenceError on every mouse
    // interaction here (this handler is bound to both mousedown and
    // touchstart). Feature-detect via the `touches` property instead — it
    // narrows the union without referencing a possibly-undefined global.
    if ("touches" in event) {
      const touch = event.touches[0]!;
      this.startY = touch.clientY;
      this.startX = touch.clientX;
      this.currentY = this.startY;
      this.currentX = this.startX;
    } else {
      this.startY = event.clientY;
      this.startX = event.clientX;
      this.currentY = this.startY;
      this.currentX = this.startX;
    }
    this.startTime = Date.now();
    this.hasMoved = false;

    if ("touches" in event) {
      // Touch: start drag immediately for responsive mobile UX
      this.isDragging = true;
      this.pendingMouseDrag = false;
      this.reportDragProgress();
    } else {
      // Mouse: defer drag until movement exceeds threshold.
      // This prevents normal clicks on messages/buttons from being
      // hijacked by the swipe-to-dismiss system.
      this.pendingMouseDrag = true;
      this.isDragging = false;
    }
  }

  private handleTouchMove(event: TouchEvent | MouseEvent) {
    if (!this.options.dismissible) return;

    // For mouse events with pending drag, check if movement exceeds threshold
    // before promoting to a real drag. This lets normal clicks pass through.
    if (this.pendingMouseDrag && !this.isDragging) {
      if (event instanceof MouseEvent) {
        const deltaX = Math.abs(event.clientX - this.startX);
        const deltaY = Math.abs(event.clientY - this.startY);
        if (deltaX > DISMISS_THRESHOLDS.MOVEMENT_THRESHOLD || deltaY > DISMISS_THRESHOLDS.MOVEMENT_THRESHOLD) {
          // Movement is intentional - promote to real drag
          this.isDragging = true;
          this.pendingMouseDrag = false;
          this.reportDragProgress();
        }
      }
      return;
    }

    if (!this.isDragging) return;

    if ("touches" in event) {
      const touch = event.touches[0]!;
      this.currentY = touch.clientY;
      this.currentX = touch.clientX;
    } else {
      this.currentY = event.clientY;
      this.currentX = event.clientX;
    }

    // When delegating to top drawer, just track movement but don't apply visuals
    if (this.delegatingToTopDrawer) {
      const deltaY = this.currentY - this.startY;
      const deltaX = this.currentX - this.startX;
      if (Math.abs(deltaY) > DISMISS_THRESHOLDS.MOVEMENT_THRESHOLD || Math.abs(deltaX) > DISMISS_THRESHOLDS.MOVEMENT_THRESHOLD) {
        this.hasMoved = true;
      }
      return;
    }

    const deltaY = this.currentY - this.startY;
    const deltaX = this.currentX - this.startX;
    const absDeltaY = Math.abs(deltaY);
    const absDeltaX = Math.abs(deltaX);

    // A vertical scroll can drift toward a side drawer's dismiss edge. Hand
    // that gesture back before horizontal drift cancels native scrolling.
    if (
      (this.options.placement === "left" || this.options.placement === "right") &&
      absDeltaY > absDeltaX &&
      absDeltaY > DISMISS_THRESHOLDS.MOVEMENT_THRESHOLD
    ) {
      this.isDragging = false;
      this.options.onDragChange?.(0, 1, false);
      return;
    }

    // Check if user is swiping in the dismiss direction
    const isSwipingInDismissDirection =
      (this.options.placement === "bottom" && deltaY > 0) ||
      (this.options.placement === "top" && deltaY < 0) ||
      (this.options.placement === "right" && deltaX > 0) ||
      (this.options.placement === "left" && deltaX < 0);

    // Check if user is swiping in the scroll direction (opposite of dismiss)
    const isSwipingInScrollDirection =
      (this.options.placement === "bottom" && deltaY < 0) ||
      (this.options.placement === "top" && deltaY > 0) ||
      (this.options.placement === "right" && deltaX < 0) ||
      (this.options.placement === "left" && deltaX > 0);

    // If user is swiping in the scroll direction (opposite of dismiss),
    // abort the drag to let native scroll take over.
    // This applies whether or not we detected a scrollable container,
    // since the detection can fail in complex flex layouts.
    if (
      isSwipingInScrollDirection &&
      (absDeltaY > DISMISS_THRESHOLDS.MOVEMENT_THRESHOLD || absDeltaX > DISMISS_THRESHOLDS.MOVEMENT_THRESHOLD)
    ) {
      this.isDragging = false;
      this.options.onDragChange?.(0, 1, false);
      return; // Let native scroll handle it
    }

    // If there's a scrollable container and scroll is NOT at the dismiss boundary,
    // and user is swiping in the dismiss direction, abort the drag and let scroll happen
    if (
      this.scrollableContainer &&
      !this.scrollAtBoundary &&
      isSwipingInDismissDirection
    ) {
      // Re-check boundary in case user scrolled to top during this gesture
      this.scrollAtBoundary = this.isScrollAtDismissBoundary(
        this.scrollableContainer
      );

      if (!this.scrollAtBoundary) {
        // Abort drag - let native scroll take over
        this.isDragging = false;
        this.options.onDragChange?.(0, 1, false);
        return;
      }
    }

    // Travel along the axis that could actually dismiss. Off-axis drift — a
    // thumb rolling vertically on a right-placed drawer — is not a dismiss
    // gesture and must never be treated as one.
    const dismissAxisTravel =
      this.options.placement === "right" || this.options.placement === "left"
        ? absDeltaX
        : absDeltaY;

    // Gestures that began on a control only forfeit their click once they clear
    // real tap slop on the dismiss axis (see TAP_SLOP). Everything else keeps
    // the original 5px drag threshold.
    const forfeitsTap =
      dismissAxisTravel > DISMISS_THRESHOLDS.TAP_SLOP;

    if (absDeltaY > DISMISS_THRESHOLDS.MOVEMENT_THRESHOLD || absDeltaX > DISMISS_THRESHOLDS.MOVEMENT_THRESHOLD) {
      if (!this.startedOnInteractive || forfeitsTap) {
        this.hasMoved = true;
      }
      if (this.startedOnInteractive && forfeitsTap) {
        event.preventDefault();
      }
    }

    // Prevent default for valid drag directions (only if scroll is at boundary OR no scrollable container)
    // AND only when swiping in dismiss direction
    if (
      (this.scrollAtBoundary || !this.scrollableContainer) &&
      isSwipingInDismissDirection
    ) {
      event.preventDefault();
    }

    // Report drag progress
    this.reportDragProgress();
  }

  private handleTouchEnd(event: TouchEvent | MouseEvent) {
    // If mouse drag never exceeded threshold, it was a normal click - let it through
    if (this.pendingMouseDrag && !this.isDragging) {
      this.pendingMouseDrag = false;
      this.reset();
      return;
    }

    if (!this.isDragging || !this.options.dismissible) return;

    const deltaY = this.currentY - this.startY;
    const deltaX = this.currentX - this.startX;
    const duration = Date.now() - this.startTime;

    // Handle delegation to top drawer
    if (this.delegatingToTopDrawer) {
      this.isDragging = false;
      this.delegatingToTopDrawer = false;

      // Check if gesture was significant enough to dismiss
      if (this.isAboveDismissThreshold(deltaX, deltaY, duration)) {
        debug.log("delegating dismiss to top drawer");
        dismissTopDrawer();
      }

      this.reset();
      return;
    }

    if (this.startedOnInteractive && this.hasMoved) {
      event.preventDefault();
      event.stopPropagation();
      this.justDragged = true;
      setTimeout(() => {
        this.justDragged = false;
      }, 100);
    }

    this.isDragging = false;

    // Calculate offset based on placement
    const offset =
      this.options.placement === "right" || this.options.placement === "left"
        ? this.getDragOffsetXInternal(deltaX)
        : this.getDragOffsetYInternal(deltaY);

    // Calculate velocity (px/ms)
    const velocity = duration > 0 ? Math.abs(offset) / duration : 0;

    // Allow custom handler to intercept drag end (for snap points)
    if (this.options.onDragEnd) {
      const handled = this.options.onDragEnd(offset, velocity, duration);
      if (handled) {
        // Custom handler took over - reset and return
        this.startY = 0;
        this.currentY = 0;
        this.startX = 0;
        this.currentX = 0;
        this.options.onDragChange?.(0, 1, false);
        return;
      }
    }

    // Check dismissal threshold based on placement
    const wasAboveThreshold = this.isAboveDismissThreshold(deltaX, deltaY, duration);

    // Debug logging
    debug.log(
      `Swipe end: placement=${this.options.placement}, deltaX=${deltaX}, deltaY=${deltaY}, duration=${duration}ms, threshold=${wasAboveThreshold}`
    );

    this.startY = 0;
    this.currentY = 0;
    this.startX = 0;
    this.currentX = 0;

    // Notify drag ended (offset 0, progress 1, isDragging false)
    this.options.onDragChange?.(0, 1, false);

    if (wasAboveThreshold) {
      debug.log("Dismissing drawer");
      this.options.onDismiss();
    }
  }

  /** Internal offset calculation that takes the raw delta */
  private getDragOffsetYInternal(delta: number): number {
    const damped = this.damp(delta);
    if (this.options.placement === "bottom") {
      return Math.max(0, damped);
    } else if (this.options.placement === "top") {
      return Math.min(0, damped);
    }
    return 0;
  }

  /** Internal offset calculation that takes the raw delta */
  private getDragOffsetXInternal(delta: number): number {
    const damped = this.damp(delta);
    if (this.options.placement === "right") {
      return Math.max(0, damped);
    } else if (this.options.placement === "left") {
      return Math.min(0, damped);
    }
    return 0;
  }

  /**
   * Check if a swipe gesture exceeds the dismiss threshold.
   * Considers both distance (slow swipe) and velocity (fast swipe).
   */
  private isAboveDismissThreshold(
    deltaX: number,
    deltaY: number,
    duration: number
  ): boolean {
    const {
      DISTANCE_SLOW,
      DISTANCE_FAST,
      FAST_SWIPE_MAX_DURATION,
      DISTANCE_BOUNDARY,
    } = DISMISS_THRESHOLDS;

    // Gestures that began at a scroll edge require a deliberate, distance-based
    // pull — the fast-swipe shortcut is dropped so an accidental scroll flick at
    // the top of a list springs back instead of dismissing. deltaX/deltaY are
    // raw finger travel (undamped), so this gates on physical pull distance.
    if (this.startedAtScrollBoundary) {
      switch (this.options.placement) {
        case "bottom":
          return deltaY > DISTANCE_BOUNDARY;
        case "top":
          return deltaY < -DISTANCE_BOUNDARY;
        case "right":
          return deltaX > DISTANCE_BOUNDARY;
        case "left":
          return deltaX < -DISTANCE_BOUNDARY;
        default:
          return false;
      }
    }

    const isFastSwipe = duration < FAST_SWIPE_MAX_DURATION;

    switch (this.options.placement) {
      case "bottom":
        return deltaY > DISTANCE_SLOW || (deltaY > DISTANCE_FAST && isFastSwipe);
      case "top":
        return deltaY < -DISTANCE_SLOW || (deltaY < -DISTANCE_FAST && isFastSwipe);
      case "right":
        return deltaX > DISTANCE_SLOW || (deltaX > DISTANCE_FAST && isFastSwipe);
      case "left":
        return deltaX < -DISTANCE_SLOW || (deltaX < -DISTANCE_FAST && isFastSwipe);
      default:
        return false;
    }
  }

  private handleClick(event: MouseEvent) {
    if (this.justDragged) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  }

  private reportDragProgress() {
    if (!this.options.onDragChange || !this.isDragging) return;

    const offset =
      this.options.placement === "right" || this.options.placement === "left"
        ? this.getDragOffsetX()
        : this.getDragOffsetY();

    let progress = 0;
    if (this.options.placement === "right") {
      const drawerWidth = this.element?.offsetWidth || 600;
      progress = Math.max(0, Math.min(1, 1 - offset / drawerWidth));
    } else if (this.options.placement === "left") {
      const drawerWidth = this.element?.offsetWidth || 600;
      progress = Math.max(0, Math.min(1, 1 + offset / drawerWidth));
    } else if (this.options.placement === "bottom") {
      const drawerHeight = this.element?.offsetHeight || 400;
      progress = Math.max(0, Math.min(1, 1 - offset / drawerHeight));
    } else if (this.options.placement === "top") {
      const drawerHeight = this.element?.offsetHeight || 400;
      progress = Math.max(0, Math.min(1, 1 + offset / drawerHeight));
    }

    this.options.onDragChange(offset, progress, true);
  }
}
