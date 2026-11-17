import type {
  ITrailOverlayCanvas,
  TrailOverlayRenderParams,
} from "./ITrailOverlayCanvas";

type TrailOverlayFactory = () => ITrailOverlayCanvas;

export interface AdaptiveTrailOverlayOptions {
  createPrimary: TrailOverlayFactory;
  createFallback: TrailOverlayFactory;
  onPrimaryFailure?: (error: unknown) => void;
  onFallbackFailure?: (error: unknown) => void;
}

/**
 * Keeps trails available when the preferred renderer cannot initialize. The
 * owner supplies both implementations so this lifecycle coordinator stays
 * independent of any particular rendering backend.
 */
export class AdaptiveTrailOverlay implements ITrailOverlayCanvas {
  private readonly createPrimary: TrailOverlayFactory;
  private readonly createFallback: TrailOverlayFactory;
  private readonly onPrimaryFailure: (error: unknown) => void;
  private readonly onFallbackFailure: (error: unknown) => void;

  private active: ITrailOverlayCanvas | null = null;
  private primary: ITrailOverlayCanvas | null = null;
  private container: HTMLElement | null = null;
  private width = 0;
  private height = 0;
  private visible = true;
  private zIndex = 1;
  private generation = 0;

  constructor(options: AdaptiveTrailOverlayOptions) {
    this.createPrimary = options.createPrimary;
    this.createFallback = options.createFallback;
    this.onPrimaryFailure =
      options.onPrimaryFailure ??
      ((error) =>
        console.warn(
          "[TrailOverlay] WebGL2 unavailable; using Canvas2D trails.",
          error
        ));
    this.onFallbackFailure =
      options.onFallbackFailure ??
      ((error) =>
        console.warn(
          "[TrailOverlay] Canvas2D fallback unavailable; trails disabled.",
          error
        ));
  }

  initialize(container: HTMLElement, width: number, height: number): void {
    this.dispose();
    this.container = container;
    this.width = width;
    this.height = height;
    const generation = this.generation;
    const primary = this.createPrimary();
    this.active = primary;
    this.primary = primary;
    // A context lost after start-up reaches us here at once, so trails move to
    // Canvas2D without waiting for the next resize or frame to throw.
    primary.setFailureHandler?.((error) =>
      this.activateFallback(primary, generation, error)
    );

    let initialization: void | Promise<void>;
    try {
      initialization = primary.initialize(container, width, height);
      this.applyPresentation(primary);
    } catch (error) {
      this.activateFallback(primary, generation, error);
      return;
    }

    void Promise.resolve(initialization)
      .then(() => {
        if (generation === this.generation && this.active === primary) {
          this.applyPresentation(primary);
        }
      })
      .catch((error) => {
        this.activateFallback(primary, generation, error);
      });
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.guard((overlay) => overlay.resize(width, height));
  }

  renderFrame(params: TrailOverlayRenderParams): void {
    this.guard((overlay) => overlay.renderFrame(params));
  }

  clear(): void {
    this.guard((overlay) => overlay.clear());
  }

  clearBuffers(): void {
    this.guard((overlay) => overlay.clearBuffers());
  }

  refreshStyle(): void {
    this.guard((overlay) => overlay.refreshStyle());
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.active?.setVisible(visible);
  }

  setCanvasZIndex(z: number): void {
    this.zIndex = z;
    this.active?.setCanvasZIndex(z);
  }

  dispose(): void {
    this.generation += 1;
    this.active?.dispose();
    this.active = null;
    this.primary = null;
    this.container = null;
    this.width = 0;
    this.height = 0;
  }

  private activateFallback(
    failedPrimary: ITrailOverlayCanvas,
    generation: number,
    primaryError: unknown
  ): void {
    if (
      generation !== this.generation ||
      this.active !== failedPrimary ||
      !this.container
    ) {
      return;
    }

    this.onPrimaryFailure(primaryError);
    this.primary = null;
    try {
      failedPrimary.dispose();
    } catch {
      // The dead renderer is already unusable; the fallback replaces it.
    }

    let fallback: ITrailOverlayCanvas;
    try {
      fallback = this.createFallback();
    } catch (error) {
      this.onFallbackFailure(error);
      this.active = null;
      return;
    }
    this.active = fallback;
    const container = this.container;

    let initialization: void | Promise<void>;
    try {
      initialization = fallback.initialize(container, this.width, this.height);
      this.applyPresentation(fallback);
    } catch (error) {
      this.disableFallback(fallback, generation, error);
      return;
    }

    void Promise.resolve(initialization)
      .then(() => {
        if (generation === this.generation && this.active === fallback) {
          this.applyPresentation(fallback);
        }
      })
      .catch((error) => {
        this.disableFallback(fallback, generation, error);
      });
  }

  /** Runs a call on the active overlay; a throw swaps or disables, never escapes. */
  private guard(call: (overlay: ITrailOverlayCanvas) => void): void {
    const overlay = this.active;
    if (!overlay) return;
    try {
      call(overlay);
    } catch (error) {
      if (overlay === this.primary) {
        this.activateFallback(overlay, this.generation, error);
      } else {
        this.disableFallback(overlay, this.generation, error);
      }
    }
  }

  private disableFallback(
    fallback: ITrailOverlayCanvas,
    generation: number,
    error: unknown
  ): void {
    if (generation !== this.generation || this.active !== fallback) return;
    this.onFallbackFailure(error);
    this.active = null;
    try {
      fallback.dispose();
    } catch {
      // Nothing left to recover; trails stay off.
    }
  }

  private applyPresentation(overlay: ITrailOverlayCanvas): void {
    overlay.setVisible(this.visible);
    overlay.setCanvasZIndex(this.zIndex);
  }
}
