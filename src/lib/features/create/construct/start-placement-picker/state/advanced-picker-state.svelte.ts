/**
 * Advanced Start Placement Picker State
 *
 * Manages UI state for the advanced picker component including:
 * - Animation state for entrance effects
 * - Grid mode transitions
 * - Overflow detection
 * - Staggered animation tracking
 */

import type { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

export function createAdvancedPickerState() {
  // Animation state for entrance effect
  let shouldAnimate = $state(false);
  let animatedPictographs = $state(new Set<string>());

  // Grid mode transition state
  let isTransitioning = $state(false);
  let previousGridMode = $state<GridMode | undefined>(undefined);

  // Overflow detection state
  let hasOverflow = $state(false);

  /**
   * Initialize animations after mount
   * Call this from onMount() in the component
   *
   * Animation disabled - placements appear instantly for speed
   */
  function initializeAnimations() {
    // Animation disabled - do nothing
    // Kept for API compatibility
  }

  /**
   * Handle grid mode change with transition animation
   */
  function handleGridModeChange(
    _newGridMode: GridMode,
    currentGridMode: GridMode
  ) {
    if (
      previousGridMode !== currentGridMode &&
      previousGridMode !== undefined
    ) {
      // Grid mode changed - update state but skip animation
      isTransitioning = true;
      animatedPictographs.clear();

      // Quick state reset without animation
      setTimeout(() => {
        isTransitioning = false;
      }, 50);
    }
    previousGridMode = currentGridMode;
  }

  /**
   * Mark a pictograph as animated (kept for compatibility)
   */
  function markAnimationComplete(_pictographId: string) {
    animatedPictographs.add(_pictographId);
    animatedPictographs = new Set(animatedPictographs);
  }

  /**
   * Check if a pictograph should animate
   */
  function shouldPictographAnimate(_pictographId: string): boolean {
    return false; // Animation disabled
  }

  /**
   * Check if content is overflowing
   */
  function checkOverflow(element: HTMLElement | null): boolean {
    if (!element) return false;
    const isOverflowing = element.scrollHeight > element.clientHeight;
    hasOverflow = isOverflowing;
    return isOverflowing;
  }

  /**
   * Setup resize handling for overflow detection
   * Returns cleanup function
   */
  function setupOverflowDetection(element: HTMLElement | null): () => void {
    if (!element) return () => {};

    const handleResize = () => {
      requestAnimationFrame(() => {
        checkOverflow(element);
      });
    };

    window.addEventListener("resize", handleResize);

    // Initial check
    requestAnimationFrame(() => {
      checkOverflow(element);
    });

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }

  /**
   * Reset animation state (useful for grid mode changes)
   */
  function resetAnimationState() {
    animatedPictographs.clear();
    shouldAnimate = false;
  }

  return {
    // State getters
    get shouldAnimate() {
      return shouldAnimate;
    },
    get isTransitioning() {
      return isTransitioning;
    },
    get hasOverflow() {
      return hasOverflow;
    },
    get previousGridMode() {
      return previousGridMode;
    },

    // Actions
    initializeAnimations,
    handleGridModeChange,
    markAnimationComplete,
    shouldPictographAnimate,
    checkOverflow,
    setupOverflowDetection,
    resetAnimationState,
  };
}

export type AdvancedPickerState = ReturnType<typeof createAdvancedPickerState>;
