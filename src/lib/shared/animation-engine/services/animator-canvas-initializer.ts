/**
 * Animator Canvas Initializer Service Implementation
 *
 * Orchestrates the complex async initialization sequence for AnimatorCanvas.
 */

import type { IAnimationRenderer as AnimationRenderer } from "$lib/shared/animation-engine/services/IAnimationRenderer";
import { loadAnimationRenderer } from "./animator-loader";
import { DEFAULT_CANVAS_SIZE } from "./canvas-resizer.svelte";
import type {
  InitializationResult,
  InitializerCallbacks,
  InitializerDependencies,
} from "./IAnimatorCanvasInitializer";

/**
 * Measure the actual size of a container element.
 * Returns DEFAULT_CANVAS_SIZE if container has no dimensions yet.
 */
function measureContainerSize(container: HTMLDivElement): number {
  const rect = container.getBoundingClientRect();
  const size = Math.min(
    rect.width || DEFAULT_CANVAS_SIZE,
    rect.height || DEFAULT_CANVAS_SIZE
  );
  return size > 0 ? size : DEFAULT_CANVAS_SIZE;
}

export class AnimatorCanvasInitializer {
  private renderer: AnimationRenderer | null = null;
  private initialized = false;
  private isInitializing = false;
  private destroyRequested = false;

  async initialize(
    deps: InitializerDependencies,
    callbacks: InitializerCallbacks
  ): Promise<InitializationResult> {
    // Guard against concurrent initializations
    if (this.isInitializing) {
      return { success: false, error: "Initialization already in progress" };
    }
    if (this.initialized) {
      return { success: true, canvas: this.renderer?.getCanvas() };
    }

    this.isInitializing = true;
    this.destroyRequested = false;

    try {
      // Step 1: Load animator services (DI container services)
      const servicesLoaded = await deps.loadAnimatorServices();
      if (!servicesLoaded || this.destroyRequested) {
        this.isInitializing = false;
        return {
          success: false,
          error: this.destroyRequested
            ? "Destroyed during initialization"
            : "Failed to load animator services",
        };
      }

      // Step 2: Load animation renderer
      if (!this.renderer) {
        callbacks.onPixiLoading(true);
        callbacks.onPixiError(null);

        const rendererResult = await loadAnimationRenderer();
        callbacks.onPixiLoading(false);

        // Check if destroyed during async operation
        if (this.destroyRequested) {
          this.isInitializing = false;
          return { success: false, error: "Destroyed during initialization" };
        }

        if (!rendererResult.success) {
          callbacks.onPixiError(
            rendererResult.error ?? "Unknown renderer error"
          );
          this.isInitializing = false;
          return { success: false, error: rendererResult.error };
        }

        this.renderer = rendererResult.renderer!;
        callbacks.onPixiRendererReady(this.renderer);

        // Initialize pre-computation now that renderer is available
        deps.initializePrecomputationService();
      }

      // Step 3: Verify container is still valid and not destroyed
      if (!deps.containerElement || this.destroyRequested) {
        this.isInitializing = false;
        return {
          success: false,
          error: this.destroyRequested
            ? "Destroyed during initialization"
            : "Container element became null during initialization",
        };
      }

      // Step 4: Measure container size BEFORE initializing renderer to avoid resize flash
      const initialSize = measureContainerSize(deps.containerElement);

      // Step 5: Initialize renderer with measured size
      await this.renderer.initialize(
        deps.containerElement,
        initialSize,
        deps.backgroundAlpha,
        deps.paintBackground ?? false
      );

      // Check if destroyed during async operation
      if (this.destroyRequested) {
        this.renderer?.destroy();
        this.renderer = null;
        this.isInitializing = false;
        return { success: false, error: "Destroyed during initialization" };
      }

      // Step 6: Initialize texture services
      deps.initializePropTextureLoader();

      // Step 7: Load initial textures
      const initialGridMode = deps.gridMode?.toString() ?? "diamond";
      await Promise.all([
        this.renderer.loadGridTexture(
          initialGridMode,
          deps.showNonRadialPoints ?? true,
          deps.gridJoin ?? null
        ),
        deps.loadPropTextures(),
      ]);

      // Final check if destroyed during texture loading
      if (this.destroyRequested) {
        this.renderer?.destroy();
        this.renderer = null;
        this.isInitializing = false;
        return { success: false, error: "Destroyed during initialization" };
      }

      // Step 8: Mark as initialized
      this.initialized = true;
      callbacks.onInitialized(true);

      const canvas = this.renderer.getCanvas();
      callbacks.onCanvasReady(canvas);

      // Step 9: Set up remaining services
      deps.initializeResizeService();
      deps.initializeGlyphTextureLoader();
      deps.initializeRenderLoopService();

      // Step 10: Start render loop
      deps.startRenderLoop();

      this.isInitializing = false;
      return { success: true, canvas };
    } catch (err) {
      const error =
        err instanceof Error ? err.message : "Unknown initialization error";
      console.error("Failed to initialize animation renderer:", err);
      this.isInitializing = false;
      return { success: false, error };
    }
  }

  destroy(
    callbacks: Pick<InitializerCallbacks, "onCanvasReady" | "onInitialized">
  ): void {
    // Signal any in-progress initialization to abort
    this.destroyRequested = true;

    // Only destroy renderer if not currently initializing (let init handle its own cleanup)
    if (!this.isInitializing && this.renderer) {
      this.renderer.destroy();
      this.renderer = null;
    }

    this.initialized = false;
    callbacks.onCanvasReady(null);
    callbacks.onInitialized(false);
  }

  getRenderer(): AnimationRenderer | null {
    return this.renderer;
  }

  isReady(): boolean {
    return this.initialized;
  }
}
