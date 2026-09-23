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
import {
  measureFrame,
  sameFrame,
  squareFrame,
  type CanvasFrame,
} from "../domain/types/canvas-frame";

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
 * Marks an inert ancestor that keeps its full layout box — a crossfade's
 * standby source staged behind the live one. Observations inside it are real
 * geometry rather than a pane collapsing out of the workspace, so they are not
 * suppressed. DualSourceCrossfade sets it on its hidden source.
 */
const SUPPRESSING_INERT_SELECTOR = "[inert]:not([data-inert-keeps-layout])";

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
  /** Current canvas size: the side of the engine's square */
  currentSize: number;
  /** The whole rectangle the container occupies; the square is centred in it */
  frame: CanvasFrame;
  /** Increments on each completed resize (for triggering reactivity) */
  resizeCount: number;
  /** Whether a resize is in progress */
  isResizing: boolean;
}

export class CanvasResizer {
  // Reactive state - owned by service
  state = $state<CanvasResizeState>({
    currentSize: DEFAULT_CANVAS_SIZE,
    frame: squareFrame(DEFAULT_CANVAS_SIZE),
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
  /** Lifting `inert` does not change the container's box, so ResizeObserver
   *  stays silent on reveal. This watches the suppressing ancestor instead. */
  private revealObserver: MutationObserver | null = null;
  private hasSizedFromObservation = false;
  /** The renderer is initialized before ResizeObserver reports its first box.
   *  Keep that observer pass responsible for its initial texture resize, while
   *  publishing the layout frame immediately so effect overlays never begin
   *  life with the default 500px square. */
  private hasAppliedInitialFrame = false;

  // Bound reference to resize handler for event listener cleanup
  private boundResizeHandler = () => this.handleResize();

  initialize(container: HTMLDivElement, renderer: ResizableRenderer): void {
    this.container = container;
    this.renderer = renderer;
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width > 0 && height > 0) {
      const frame = measureFrame(width, height);
      this.state.currentSize = frame.size;
      this.state.frame = frame;
    }
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
    this.stopWatchingForReveal();

    if (typeof window !== "undefined") {
      window.removeEventListener("resize", this.boundResizeHandler);
    }
  }

  /** Explicit, caller-driven resize. Never coalesced — the caller is asking for
   *  this size now, not reporting that the container drifted. */
  async resize(currentSize: number): Promise<number> {
    this.cancelSettle();
    this.state.currentSize = currentSize;
    this.state.frame = squareFrame(currentSize);
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
    this.hasAppliedInitialFrame = false;
    this.container = null;
    this.renderer = null;
    this.state.currentSize = DEFAULT_CANVAS_SIZE;
    this.state.frame = squareFrame(DEFAULT_CANVAS_SIZE);
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
    return this.suppressingAncestor() !== null;
  }

  private suppressingAncestor(): Element | null {
    return this.container?.closest(SUPPRESSING_INERT_SELECTOR) ?? null;
  }

  /**
   * A surface can be revealed without its box changing — a crossfade source
   * that was already full size, a pane that stayed laid out. No observer
   * callback follows, so without this the revealed canvas keeps the raster it
   * had when it went inert, stretched over whatever the stage became since.
   */
  private watchForReveal(): void {
    if (this.revealObserver || typeof MutationObserver === "undefined") return;
    const ancestor = this.suppressingAncestor();
    if (!ancestor) return;
    this.revealObserver = new MutationObserver(() => {
      this.stopWatchingForReveal();
      // Re-evaluates from scratch: another inert ancestor re-arms the watch,
      // a full reveal takes the settle-after-reveal path below.
      this.handleResize();
    });
    this.revealObserver.observe(ancestor, {
      attributes: true,
      attributeFilter: ["inert", "data-inert-keeps-layout"],
    });
  }

  private stopWatchingForReveal(): void {
    this.revealObserver?.disconnect();
    this.revealObserver = null;
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
      this.watchForReveal();
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
    const frame = measureFrame(width, height);
    const newSize = frame.size;

    // The main canvas only rebuilds when its square changes. A wrapper that
    // grows sideways at the same height still counts as a resize, because the
    // effect overlays paint the whole rectangle and must be reallocated to it.
    const frameChanged = !sameFrame(frame, this.state.frame);
    if (frameChanged || !this.hasAppliedInitialFrame) {
      this.state.isResizing = true;
      const squareChanged = newSize !== this.state.currentSize;
      this.state.currentSize = newSize;
      this.state.frame = frame;
      if (squareChanged || !this.hasAppliedInitialFrame)
        await this.renderer.resize(newSize);
      this.hasAppliedInitialFrame = true;
      this.state.isResizing = false;
      this.state.resizeCount++; // Increment to trigger reactivity
    }

    return newSize;
  }
}
