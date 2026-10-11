/**
 * Glyph Texture Loader Implementation
 *
 * Manages glyph texture loading for AnimatorCanvas.
 * Uses reactive state ownership - service owns $state, component derives from it.
 */

import type { IAnimationRenderer as AnimationRenderer } from "#lib/shared/animation-engine/services/IAnimationRenderer.js";
import type {
  GlyphTextureState,
  PendingGlyph,
} from "./IGlyphTextureLoader";

export class GlyphTextureLoader {
  // Reactive state - owned by service
  state = $state<GlyphTextureState>({
    isLoaded: false,
    isLoading: false,
    pendingGlyph: null,
    loadCount: 0,
    error: null,
  });

  private renderer: AnimationRenderer | null = null;

  initialize(renderer: AnimationRenderer): void {
    this.renderer = renderer;
  }

  handleGlyphSvgReady(
    svgString: string,
    width: number,
    height: number,
    _x: number,
    _y: number
  ): void {
    this.loadGlyphTexture(svgString, width, height, this.renderer !== null);
  }

  async loadGlyphTexture(
    svgString: string,
    width: number,
    height: number,
    isInitialized: boolean
  ): Promise<void> {
    // Guard: must be initialized before loading textures
    if (!this.renderer || !isInitialized) {
      // Queue for later if not initialized yet
      this.state.pendingGlyph = { svgString, width, height };
      return;
    }

    this.state.isLoading = true;
    this.state.error = null;

    try {
      await this.renderer.loadGlyphTexture(svgString, width, height);
      this.state.pendingGlyph = null;
      this.state.isLoaded = true;
      this.state.loadCount++; // Increment to trigger reactivity
    } catch (err) {
      console.error("[GlyphTextureLoader] Failed to load glyph texture:", err);
      this.state.error = err instanceof Error ? err.message : "Load failed";
    } finally {
      this.state.isLoading = false;
    }
  }

  getPendingGlyph(): PendingGlyph | null {
    return this.state.pendingGlyph;
  }

  async processPendingGlyph(): Promise<void> {
    if (this.state.pendingGlyph && this.renderer) {
      const { svgString, width, height } = this.state.pendingGlyph;
      await this.loadGlyphTexture(svgString, width, height, true);
    }
  }

  dispose(): void {
    this.renderer = null;
    this.state.pendingGlyph = null;
    this.state.isLoaded = false;
    this.state.isLoading = false;
    this.state.error = null;
  }
}
