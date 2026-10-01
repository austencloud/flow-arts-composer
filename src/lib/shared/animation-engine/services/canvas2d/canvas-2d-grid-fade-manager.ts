/**
 * Canvas2D Grid Fade Transition Manager
 *
 * Handles grid visibility toggle transitions:
 * - Smooth fade-in when grid becomes visible
 * - Smooth fade-out when grid becomes hidden
 * - Uses cubic easing for smooth, professional transitions
 *
 * Single Responsibility: Grid visibility transition logic
 */

export interface GridFadeState {
  alpha: number;
  isTransitioning: boolean;
  targetVisible: boolean;
}

export class Canvas2DGridFadeManager {
  private readonly FADE_IN_DURATION_MS = 250;
  private readonly FADE_OUT_DURATION_MS = 200;

  private isTransitioning: boolean = false;
  private transitionStartTime: number | null = null;
  private currentAlpha: number = 1;
  private targetVisible: boolean = true;
  private previousVisible: boolean = true;

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
      // the caller drives us with — never wall time. The live path drives rAF
      // `performance.now()`, the offscreen export path drives a virtual clock from
      // 0; stamping `performance.now()` here and subtracting the virtual clock in
      // updateProgress produced a massively negative elapsed in export, clamping
      // alpha to 0. (Grid never flips mid-export today, so this never bit the grid
      // — but it shares the manager's contract; keep both managers clock-agnostic.)
      this.transitionStartTime = null;
      this.previousVisible = visible;
    }
  }

  /**
   * Update transition progress and return current alpha
   */
  updateProgress(currentTime: number): GridFadeState {
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
      ? this.FADE_IN_DURATION_MS
      : this.FADE_OUT_DURATION_MS;
    const progress = Math.min(elapsed / duration, 1);

    // Use smooth cubic easing for both fade-in and fade-out
    if (this.targetVisible) {
      // Smooth ease-out for fade-in
      this.currentAlpha = this.easeOutCubic(progress);
    } else {
      // Smooth ease-out for fade-out
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
