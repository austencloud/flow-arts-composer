/**
 * Scroll State Factory
 *
 * Svelte 5 runes-based state management for scroll detection and auto-scroll behavior.
 */

export function createScrollState() {
  // Scroll state
  let hasVerticalScrollbar = $state(false);
  let autoScrollEnabled = $state(true);
  let scrollContainerRef = $state<HTMLElement | null>(null);
  let scrollbarCheckFrame: number | null = null;

  /**
   * Check if container has vertical scrollbar
   * Uses a threshold to avoid false positives from tiny overflow (rounding, padding, etc.)
   */
  function checkScrollbar() {
    if (!scrollContainerRef) return;

    // Only consider it "has scrollbar" if overflow exceeds threshold (e.g., at least 1 row of content)
    const overflowThreshold = 30; // pixels - enough to indicate real scrollable content
    const hasScrollbar =
      scrollContainerRef.scrollHeight >
      scrollContainerRef.clientHeight + overflowThreshold;

    if (hasScrollbar !== hasVerticalScrollbar) {
      hasVerticalScrollbar = hasScrollbar;
    }
  }

  // ResizeObserver can fire on every frame while the surrounding panel moves.
  // The visible editor only needs the final overflow state for that paint.
  function scheduleScrollbarCheck() {
    if (scrollbarCheckFrame !== null) return;
    scrollbarCheckFrame = requestAnimationFrame(() => {
      scrollbarCheckFrame = null;
      checkScrollbar();
    });
  }

  /**
   * Scroll to bottom of container
   */
  function scrollToBottom(behavior: ScrollBehavior = "smooth") {
    if (!scrollContainerRef || !autoScrollEnabled) return;

    setTimeout(() => {
      scrollContainerRef?.scrollTo({
        top: scrollContainerRef.scrollHeight,
        behavior,
      });
    }, 100);
  }

  /**
   * Scroll to top of container
   */
  function scrollToTop(behavior: ScrollBehavior = "smooth") {
    if (!scrollContainerRef) return;

    setTimeout(() => {
      scrollContainerRef?.scrollTo({
        top: 0,
        behavior,
      });
    }, 100);
  }

  function setScrollContainer(element: HTMLElement | null) {
    if (scrollbarCheckFrame !== null) {
      cancelAnimationFrame(scrollbarCheckFrame);
      scrollbarCheckFrame = null;
    }
    scrollContainerRef = element;
    if (element) {
      checkScrollbar();
    }
  }

  /**
   * Enable/disable auto-scroll
   */
  function setAutoScroll(enabled: boolean) {
    autoScrollEnabled = enabled;
  }

  return {
    // Getters for reactive state
    get hasVerticalScrollbar() {
      return hasVerticalScrollbar;
    },
    get autoScrollEnabled() {
      return autoScrollEnabled;
    },
    get scrollContainerRef() {
      return scrollContainerRef;
    },

    // Actions
    setScrollContainer,
    checkScrollbar,
    scheduleScrollbarCheck,
    scrollToBottom,
    scrollToTop,
    setAutoScroll,
  };
}

export type ScrollState = ReturnType<typeof createScrollState>;
