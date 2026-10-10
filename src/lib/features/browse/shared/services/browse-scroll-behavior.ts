/**
 * BrowseScrollBehavior.ts
 *
 * Service that handles scroll behavior for the Browser module.
 * Determines when to hide/show UI elements (TopBar, Navigation, Filters)
 * based on scroll direction and position.
 *
 * Inspired by TabScroll's ScrollBehaviorService pattern.
 *
 * Algorithm:
 * 1. Track scroll position changes
 * 2. Calculate scroll delta (positive = down, negative = up)
 * 3. Apply threshold check (min 48px movement to trigger)
 * 4. Check minimum scroll position (only hide if > 100px from top)
 * 5. Update visibility:
 *    - Scrolling DOWN + past minimum → HIDE UI
 *    - Scrolling UP → SHOW UI
 */

import type { BrowseScrollState } from "#lib/shared/browse/state/browse-scroll-state.svelte.js";

export class BrowseScrollBehavior {
  private scrollThreshold = 50; // Minimum scroll distance to trigger hide/show
  private minScrollForHide = 100; // Minimum scroll position before hiding UI

  constructor(private scrollState: BrowseScrollState) {}

  /**
   * Handle scroll events on a container element (like the sequences grid)
   * @param scrollTop - Current scroll position of the container
   * @param lastScroll - Previous scroll position
   */
  handleContainerScroll(scrollTop: number, lastScroll: number): void {
    const scrollDelta = scrollTop - lastScroll;

    // Only trigger if scrolled past threshold
    if (Math.abs(scrollDelta) < this.scrollThreshold) {
      return;
    }

    if (scrollDelta > 0 && scrollTop > this.minScrollForHide) {
      // Scrolling DOWN & past minimum position - HIDE UI
      this.scrollState.hideUI();
    } else if (scrollDelta < 0) {
      // Scrolling UP - SHOW UI
      this.scrollState.showUI();
    }

    this.scrollState.updateScrollPosition(scrollTop);
  }

  /**
   * Force UI to be visible (used for navigation events)
   */
  forceShowUI(): void {
    this.scrollState.forceShowUI();
  }

  /**
   * Force UI to be hidden (used for fullscreen modes)
   */
  forceHideUI(): void {
    this.scrollState.forceHideUI();
  }

  /**
   * Get the current UI visibility state
   */
  isUIVisible(): boolean {
    return this.scrollState.isUIVisible;
  }

  /**
   * Configure scroll threshold (minimum pixels to trigger hide/show)
   */
  setScrollThreshold(threshold: number): void {
    this.scrollThreshold = threshold;
  }

  /**
   * Configure minimum scroll position for hiding
   */
  setMinScrollForHide(minScroll: number): void {
    this.minScrollForHide = minScroll;
  }
}
