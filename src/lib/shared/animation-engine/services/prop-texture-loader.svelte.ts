/**
 * Prop Texture Service Implementation
 *
 * Handles prop texture loading for AnimatorCanvas.
 * Uses reactive state ownership - service owns $state, component derives from it.
 */

import type { IAnimationRenderer as AnimationRenderer } from "#lib/shared/animation-engine/services/IAnimationRenderer.js";
import type { ISVGGenerator as SVGGenerator } from "#lib/shared/animation-engine/services/ISVGGenerator.js";
import type { ITrailCapturer as TrailCapturer } from "#lib/shared/animation-engine/services/ITrailCapturer.js";
import type { PropTextureState } from "./IPropTextureLoader";
import {
  DEFAULT_PROP_DIMENSIONS,
  getPropDimensions,
} from "./IPropTextureLoader";
import type { TunnelPropColorPair } from "#lib/shared/sequence-viewer/tunnel/tunnel-prop-colors.js";

export class PropTextureLoader {
  // Reactive state - owned by service, read by component via $derived
  state = $state<PropTextureState>({
    leftDimensions: { ...DEFAULT_PROP_DIMENSIONS },
    rightDimensions: { ...DEFAULT_PROP_DIMENSIONS },
    isLoaded: false,
    isLoading: false,
    error: null,
  });

  private renderer: AnimationRenderer | null = null;
  private svgGenerator: SVGGenerator | null = null;
  private TrailCapturer: TrailCapturer | null = null;

  initialize(
    renderer: AnimationRenderer,
    svgGenerator: SVGGenerator,
    TrailCapturer: TrailCapturer | null
  ): void {
    this.renderer = renderer;
    this.svgGenerator = svgGenerator;
    this.TrailCapturer = TrailCapturer;
  }

  async loadPropTextures(
    leftPropType: string,
    rightPropType: string,
    darkMode?: boolean,
    colors?: TunnelPropColorPair | null
  ): Promise<void> {
    if (!this.renderer || !this.svgGenerator) {
      console.warn(
        "[PropTextureLoader] Cannot load textures - not initialized"
      );
      this.state.error = "Service not initialized";
      return;
    }

    // For INITIAL load only (no texture loaded yet), set dimensions immediately
    // to prevent "smooshed" props on first render.
    // For prop SWITCHES (texture already exists), DON'T update dimensions yet -
    // we need to wait until the new texture loads to avoid rendering the old
    // texture with new dimensions (causes jank/squishing).
    const isInitialLoad = !this.state.isLoaded;
    if (isInitialLoad) {
      this.state.leftDimensions = getPropDimensions(leftPropType);
      this.state.rightDimensions = getPropDimensions(rightPropType);
    }

    this.state.isLoading = true;
    this.state.error = null;

    try {
      // Load textures for both prop colors
      // Pass darkMode to use local preview state instead of global
      await this.renderer.loadPerColorPropTextures(
        leftPropType,
        rightPropType,
        darkMode,
        colors
      );

      // Re-check after await - dispose() may have been called while loading
      // (e.g., user moved mouse away, unmounting the component)
      if (!this.svgGenerator) return;

      // Get prop dimensions for each color (may be different types!)
      // Pass darkMode for consistent color generation
      const [leftPropData, rightPropData] = await Promise.all([
        colors
          ? this.svgGenerator.generatePropSvg(
              leftPropType,
              colors.left,
              darkMode === undefined ? undefined : darkMode ? "dark" : "light",
              "left"
            )
          : this.svgGenerator.generateLeftPropSvg(leftPropType, darkMode),
        colors
          ? this.svgGenerator.generatePropSvg(
              rightPropType,
              colors.right,
              darkMode === undefined ? undefined : darkMode ? "dark" : "light",
              "right"
            )
          : this.svgGenerator.generateRightPropSvg(rightPropType, darkMode),
      ]);

      // Update dimensions AFTER textures are loaded - this ensures texture and
      // dimensions are updated atomically, preventing jank on prop switches
      this.state.leftDimensions = {
        width: leftPropData.width,
        height: leftPropData.height,
      };
      this.state.rightDimensions = {
        width: rightPropData.width,
        height: rightPropData.height,
      };

      this.state.isLoaded = true;

      // Direct service-to-service communication (no component middleman)
      this.TrailCapturer?.updateConfig({
        leftPropDimensions: this.state.leftDimensions,
        rightPropDimensions: this.state.rightDimensions,
      });
    } catch (err) {
      console.error("[PropTextureLoader] Failed to load prop textures:", err);
      this.state.error = err instanceof Error ? err.message : "Load failed";
    } finally {
      this.state.isLoading = false;
    }
  }

  dispose(): void {
    this.renderer = null;
    this.svgGenerator = null;
    this.TrailCapturer = null;
    this.state.isLoaded = false;
    this.state.isLoading = false;
    this.state.error = null;
  }
}
