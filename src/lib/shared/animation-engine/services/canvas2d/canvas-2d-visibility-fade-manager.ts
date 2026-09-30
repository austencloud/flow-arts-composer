/**
 * Canvas2D Visibility Fade Manager
 *
 * Generic fade transition manager for canvas elements.
 * Used for props, trails, and other toggleable elements.
 *
 * Single Responsibility: Visibility transition logic with smooth fading
 */

export interface VisibilityFadeState {
  alpha: number;
  isTransitioning: boolean;
  targetVisible: boolean;
}

export class Canvas2DVisibilityFadeManager {
  private readonly fadeInDurationMs: number;
  private readonly fadeOutDurationMs: number;

  private isTransitioning: boolean = false;
  private transitionStartTime: number | null = null;
  private currentAlpha: number = 1;
  private targetVisible: boolean = true;
  private previousVisible: boolean = true;

  constructor(
    fadeInMs: number = 250,
    fadeOutMs: number = 200,
    initiallyVisible: boolean = true
  ) {
    this.fadeInDurationMs = fadeInMs;
    this.fadeOutDurationMs = fadeOutMs;
    this.currentAlpha = initiallyVisible ? 1 : 0;
    this.targetVisible = initiallyVisible;
    this.previousVisible = initiallyVisible;
  }

  /**
   * Update visibility state and trigger transition if needed
   */
  setVisible(visible: boolean, instant = false): void {
    if (instant) {
      this.targetVisible = visible;
      this.previousVisible = visible;
      this.currentAlpha = visible ? 1 : 0;
      this.isTransitioning = false;
      this.transitionStartTime = null;
      return;
    }
    if (visible !== this.previousVisible) {
      this.targetVisible = visible;
      this.isTransitioning = true;
      // Stamp the start lazily on the next updateProgress, using the SAME clock
      // the caller drives us with. setVisible has no access to the render clock,
      // and that clock is not always wall time: the live path drives us with rAF
      // `performance.now()`, but the offscreen export path drives us with a
      // virtual clock that starts at 0. Stamping `performance.now()` here and then
      // subtracting the virtual clock in updateProgress yielded a massively
      // NEGATIVE elapsed in the export path, so progress was negative, alpha
      // clamped to 0, and the transition never completed — props were pinned
      // invisible in every exported frame. Defer the stamp to the clock we're given.
      this.transitionStartTime = null;
      this.previousVisible = visible;
    }
  }

  /**
   * Update transition progress and return current alpha
   */
  updateProgress(currentTime: number): VisibilityFadeState {
    if (!this.isTransitioning) {
      this.currentAlpha = this.targetVisible ? 1 : 0;
      return {
        alpha: this.currentAlpha,
        isTransitioning: false,
        targetVisible: this.targetVisible,
      };
    }

    // Lazily stamp the transition start with the caller's clock (see setVisible),
    // so the start time and the elapsed measurement always share one time source.
    if (this.transitionStartTime === null) {
      this.transitionStartTime = currentTime;
    }

    const elapsed = currentTime - this.transitionStartTime;
    const duration = this.targetVisible
      ? this.fadeInDurationMs
      : this.fadeOutDurationMs;
    const progress = Math.min(elapsed / duration, 1);

    // Smooth cubic easing for both directions
    if (this.targetVisible) {
      this.currentAlpha = this.easeOutCubic(progress);
    } else {
      this.currentAlpha = 1 - this.easeOutCubic(progress);
    }

    // Clamp alpha to valid range
    this.currentAlpha = Math.max(0, Math.min(1, this.currentAlpha));

    // Check if transition complete
    if (progress >= 1) {
      this.isTransitioning = false;
      this.currentAlpha = this.targetVisible ? 1 : 0;
      return {
        alpha: this.currentAlpha,
        isTransitioning: false,
        targetVisible: this.targetVisible,
      };
    }

    return {
      alpha: this.currentAlpha,
      isTransitioning: true,
      targetVisible: this.targetVisible,
    };
  }

  /**
   * Cubic ease-out for smooth fade
   */
  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  /**
   * Check if currently transitioning
   */
  isTransitionInProgress(): boolean {
    return this.isTransitioning;
  }

  /**
   * Get current alpha value
   */
  getAlpha(): number {
    return this.currentAlpha;
  }

  /**
   * Reset to visible state
   */
  reset(): void {
    this.isTransitioning = false;
    this.transitionStartTime = null;
    this.currentAlpha = 1;
    this.targetVisible = true;
    this.previousVisible = true;
  }
}
