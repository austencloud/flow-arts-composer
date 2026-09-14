/**
 * Canvas Resize Service Implementation
 *
 * Handles canvas resize logic for AnimatorCanvas.
 * Uses ResizeObserver when available, falls back to window resize.
 *
 * Uses reactive state ownership - service owns $state, component derives from it.
 */

import { motionDuration } from "$lib/shared/transitions/motion";
import { DURATION } from "$lib/shared/transitions/transitions";

/**
 * Default canvas size
 */
export const DEFAULT_CANVAS_SIZE = 500;

/**
 * How long the observed size has to hold still before the canvas is rebuilt at
 * it. Long enough to swallow every frame of a CSS transition, short enough that
 * a dragged split or a window resize lands sharp the moment the pointer stops.
 */
const RESIZE_SETTLE_MS = 40;

/**
 * Renderer interface for resize operations
 */
export interface ResizableRenderer {
  resize: (size: number) => Promise<void>;
}

/**
 * Reactive state owned by the service
 */
export interface CanvasResizeState {
  /** Current canvas size */
  currentSize: number;
  /** Increments on each completed resize (for triggering reactivity) */
  resizeCount: number;
  /** Whether a resize is in progress */
  isResizing: boolean;
}

export class CanvasResizer {
  // Reactive state - owned by service
  state = $state<CanvasResizeState>({
    currentSize: DEFAULT_CANVAS_SIZE,
    resizeCount: 0,
    isResizing: false,
  });

  private container: HTMLDivElement | null = null;
  private renderer: ResizableRenderer | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private paused = false;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private visibleSettleTimer: ReturnType<typeof setTimeout> | null = null;
  private wasObservationSuppressed = false;
  private hasSizedFromObservation = false;

  // Bound reference to resize handler for event listener cleanup
  private boundResizeHandler = () => this.handleResize();

  initialize(container: HTMLDivElement, renderer: ResizableRenderer): void {
    this.container = container;
    this.renderer = renderer;
  }

  setup(): void {
    this.teardown();

    if (typeof ResizeObserver !== "undefined" && this.container) {
      this.resizeObserver = new ResizeObserver(() => {
        this.handleResize();
      });
      this.resizeObserver.observe(this.container);
    }

    if (typeof window !== "undefined") {
      window.addEventListener("resize", this.boundResizeHandler);
    }
  }

  teardown(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.cancelSettle();
    this.cancelVisibleSettle();

    if (typeof window !== "undefined") {
      window.removeEventListener("resize", this.boundResizeHandler);
    }
  }

  /** Explicit, caller-driven resize. Never coalesced — the caller is asking for
   *  this size now, not reporting that the container drifted. */
  async resize(currentSize: number): Promise<number> {
    this.cancelSettle();
    this.state.currentSize = currentSize;
    return this.performResize();
  }

  pauseObservation(): void {
    this.paused = true;
    this.cancelSettle();
  }

  resumeObservation(): void {
    this.paused = false;
    // Catch up to whatever size the container is now
    this.handleResize();
  }

  dispose(): void {
    this.teardown();
    this.paused = false;
    this.wasObservationSuppressed = false;
    this.hasSizedFromObservation = false;
    this.container = null;
    this.renderer = null;
    this.state.currentSize = DEFAULT_CANVAS_SIZE;
    this.state.resizeCount = 0;
    this.state.isResizing = false;
  }

  private cancelSettle(): void {
    if (this.settleTimer === null) return;
    clearTimeout(this.settleTimer);
    this.settleTimer = null;
  }

  private cancelVisibleSettle(): void {
    if (this.visibleSettleTimer === null) return;
    clearTimeout(this.visibleSettleTimer);
    this.visibleSettleTimer = null;
  }

  /**
   * Keep the last readable raster while an ancestor intentionally removes this
   * surface from the workspace. Rebuilding against an inert pane's collapsed
   * geometry leaves a postage-stamp backing store that gets magnified when the
   * pane returns, making every canvas detail briefly look heavy and soft.
   */
  private observationSuppressed(): boolean {
    return this.container?.closest("[inert]") !== null;
  }

  /**
   * A container that animates its width notifies on every frame it animates,
   * and `performResize` reallocates the canvas and reloads the grid texture at
   * whatever intermediate size it caught — 150–350ms of work, per frame. That
   * is what turned a 280ms panel transition into a slideshow.
   *
   * So an observed change only arms a timer, and the canvas is rebuilt once, at
   * the size the container came to rest on. In between, the canvas keeps its
   * current backing store and the wrapper's `width: 100%; object-fit: contain`
   * scales it — briefly soft while things are moving, sharp the moment they
   * stop, which is the trade every mature canvas app makes here.
   *
   * The first observation is not deferred: the canvas would otherwise sit at
   * DEFAULT_CANVAS_SIZE and pop.
   */
  private handleResize(): void {
    if (this.paused) return;

    if (this.observationSuppressed()) {
      this.wasObservationSuppressed = true;
      this.cancelSettle();
      this.cancelVisibleSettle();
      return;
    }

    if (this.wasObservationSuppressed) {
      this.cancelSettle();
      if (this.visibleSettleTimer !== null) return;

      const settleAfterReveal =
        motionDuration(DURATION.emphasis) + RESIZE_SETTLE_MS;
      this.visibleSettleTimer = setTimeout(() => {
        this.visibleSettleTimer = null;
        if (this.paused || this.observationSuppressed()) return;
        this.wasObservationSuppressed = false;
        this.performResize();
      }, settleAfterReveal);
      return;
    }

    if (!this.hasSizedFromObservation) {
      this.hasSizedFromObservation = true;
      this.performResize();
      return;
    }

    this.cancelSettle();
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null;
      if (this.paused || this.observationSuppressed()) return;
      this.performResize();
    }, RESIZE_SETTLE_MS);
  }

  private async performResize(): Promise<number> {
    if (!this.container || !this.renderer) return this.state.currentSize;

    // A flight's transformed rectangle is not the canvas's raster allocation.
    // Transforms do not notify ResizeObserver when they finish, so sampling one
    // here can leave a tiny bitmap stretched over the settled canvas.
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width <= 0 || height <= 0) return this.state.currentSize;
    const newSize = Math.min(width, height);

    if (newSize !== this.state.currentSize) {
      this.state.isResizing = true;
      this.state.currentSize = newSize;
      await this.renderer.resize(newSize);
      this.state.isResizing = false;
      this.state.resizeCount++; // Increment to trigger reactivity
    }

    return newSize;
  }
}
