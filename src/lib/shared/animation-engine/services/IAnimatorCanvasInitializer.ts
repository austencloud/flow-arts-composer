/**
 * Animator Canvas Initializer Service Interface
 *
 * Orchestrates the complex async initialization sequence for AnimatorCanvas.
 * Handles service loading, renderer setup, texture loading, and sub-service wiring.
 */

import type { GridJoin } from "@tka/tka-types";
import type { IAnimationRenderer } from "#lib/shared/animation-engine/services/IAnimationRenderer.js";
import type { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";

/**
 * Initialization result
 */
export interface InitializationResult {
  success: boolean;
  error?: string;
  canvas?: HTMLCanvasElement | null;
}

/**
 * Callbacks for initialization state updates
 */
export interface InitializerCallbacks {
  onPixiLoading: (loading: boolean) => void;
  onPixiError: (error: string | null) => void;
  onPixiRendererReady: (renderer: IAnimationRenderer) => void;
  onInitialized: (initialized: boolean) => void;
  onCanvasReady: (canvas: HTMLCanvasElement | null) => void;
}

/**
 * Dependencies required for initialization
 */
export interface InitializerDependencies {
  containerElement: HTMLDivElement;
  backgroundAlpha: number;
  /** Live animator canvases opt out so effects can composite behind props.
   *  Export/offscreen paths leave this true to burn the background into pixels. */
  paintBackground?: boolean;
  gridMode: GridMode | null;
  showNonRadialPoints?: boolean;
  /** Load the sequence's joined pair of grids instead of one grid. */
  gridJoin?: GridJoin | null;
  loadAnimatorServices: () => Promise<boolean>;
  initializePrecomputationService: () => void;
  initializePropTextureLoader: () => void;
  initializeResizeService: () => void;
  initializeGlyphTextureLoader: () => void;
  initializeRenderLoopService: () => void;
  loadPropTextures: () => Promise<void>;
  startRenderLoop: () => void;
}

/**
 * Service for orchestrating AnimatorCanvas initialization
 */
export interface IAnimatorCanvasInitializer {
  /**
   * Run the full initialization sequence
   */
  initialize(
    deps: InitializerDependencies,
    callbacks: InitializerCallbacks
  ): Promise<InitializationResult>;

  /**
   * Clean up and destroy resources
   */
  destroy(
    callbacks: Pick<InitializerCallbacks, "onCanvasReady" | "onInitialized">
  ): void;

  /**
   * Get the current renderer (if initialized)
   */
  getRenderer(): IAnimationRenderer | null;

  /**
   * Check if initialization is complete
   */
  isReady(): boolean;
}
