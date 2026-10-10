/**
 * Glyph Texture Loader Interface
 *
 * Manages glyph texture loading for AnimatorCanvas.
 * Handles queuing glyphs when renderer isn't ready yet.
 *
 * Uses reactive state ownership - service owns $state, component derives from it.
 */

import type { IAnimationRenderer } from "#lib/shared/animation-engine/services/IAnimationRenderer.js";

/**
 * Pending glyph data
 */
export interface PendingGlyph {
  svgString: string;
  width: number;
  height: number;
}

/**
 * Reactive state owned by the service
 */
export interface GlyphTextureState {
  isLoaded: boolean;
  isLoading: boolean;
  pendingGlyph: PendingGlyph | null;
  loadCount: number; // Increments on each successful load for reactivity
  error: string | null;
}

/**
 * Service for managing glyph texture loading
 */
export interface IGlyphTextureLoader {
  /**
   * Reactive state - read from component via $derived
   */
  readonly state: GlyphTextureState;

  /**
   * Initialize the service with renderer
   */
  initialize(renderer: IAnimationRenderer): void;

  /**
   * Handler for GlyphRenderer's onSvgReady callback
   */
  handleGlyphSvgReady(
    svgString: string,
    width: number,
    height: number,
    x: number,
    y: number
  ): void;

  /**
   * Load a glyph texture (queues if not initialized)
   */
  loadGlyphTexture(
    svgString: string,
    width: number,
    height: number,
    isInitialized: boolean
  ): Promise<void>;

  /**
   * Get current pending glyph (if any)
   */
  getPendingGlyph(): PendingGlyph | null;

  /**
   * Process pending glyph if one exists.
   */
  processPendingGlyph(): Promise<void>;

  /**
   * Clean up resources
   */
  dispose(): void;
}
