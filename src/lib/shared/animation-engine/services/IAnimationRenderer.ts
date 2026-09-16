/**
 * Animation Renderer Service Contract
 *
 * Canvas2D-based rendering for the animation module.
 * Replaces PixiJS WebGL rendering with simpler, leak-free Canvas2D.
 */

import type { RenderedPropTransform } from "$lib/shared/animation-engine/domain/types/fire-types";
import type { RenderedPropSprite } from "$lib/shared/animation-engine/domain/types/rendered-prop-sprite";
import type { RenderSceneParams } from "$lib/shared/animation-engine/domain/types/animation-render-types";
import type { TunnelPropColorPair } from "$lib/shared/sequence-viewer/tunnel/tunnel-prop-colors";

export type {
  AdditionalLayerRenderData,
  AnimationVisibilitySettings,
  RenderSceneParams,
} from "$lib/shared/animation-engine/domain/types/animation-render-types";

export interface IAnimationRenderer {
  /**
   * Initialize the renderer and attach canvas to container
   * @param container - DOM element to attach the canvas to
   * @param size - Initial canvas size
   * @param backgroundAlpha - Alpha value for canvas background (0 = transparent, 1 = opaque)
   * @param paintBackground - When false, the canvas itself stays transparent (background
   *   comes from the parent element) so overlays can render behind the main canvas.
   *   Defaults to true so export/offscreen renderers still burn in their own background.
   */
  initialize(
    container: HTMLElement,
    size: number,
    backgroundAlpha?: number,
    paintBackground?: boolean
  ): Promise<void>;

  /**
   * Resize the renderer
   * @param newSize - New canvas size
   */
  resize(newSize: number): Promise<void>;

  /**
   * Render the complete animation scene
   */
  renderScene(params: RenderSceneParams): void;

  /**
   * Get the prop transforms computed during the last renderScene() call.
   * Used by fire overlay to avoid recomputing prop positions independently.
   */
  getLastPropTransforms(): {
    left: RenderedPropTransform | null;
    right: RenderedPropTransform | null;
  };

  /**
   * Get every prop sprite that was actually painted in the last frame,
   * including outgoing crossfade art and tunnel copies. Optional because
   * offscreen renderers can provide their geometry directly to an effect.
   */
  getLastRenderedPropSprites?(): readonly RenderedPropSprite[];

  /**
   * Render keys of the sprites currently on the canvas (a fan build or model
   * look, or the plain notation type). Effects resolve tip points from these.
   * Optional; a renderer without it leaves effects on the notation tables.
   */
  getLoadedPropRenderKeys?(): { left: string | null; right: string | null };

  /**
   * Get the current prop sprite images, so the echo overlay can onion-skin
   * (ghost) the real prop graphic at past poses instead of drawing a stick line.
   * Optional — only the Canvas2D renderer provides it.
   */
  getPropImages?(): {
    left: HTMLImageElement | null;
    right: HTMLImageElement | null;
  };

  /**
   * Load prop images for a specific prop type
   * @param propType - Type of prop (e.g., "staff", "club", "fan")
   */
  loadPropTextures(propType: string): Promise<void>;

  /**
   * Capture the left prop's last painted transform before a hot-swap changes
   * the sequence state. The later crossfade uses this as its visual origin.
   */
  prepareLeftPropCrossfade(): void;

  /** Red-hand counterpart of prepareBluePropCrossfade. */
  prepareRightPropCrossfade(): void;

  /**
   * Start the blue-hand prop crossfade (previous sprite fades out, new sprite
   * fades in, and both travel on one shared transform bridge). Call only from
   * a genuine prop-type hot-swap, after loadPerColorPropTextures has resolved.
   * No-op if there is no previous sprite to fade from.
   */
  startLeftPropCrossfade(): void;

  /** Red-hand counterpart of startBluePropCrossfade. Independent so one hand
   *  can swap while the other holds steady. */
  startRightPropCrossfade(): void;

  /**
   * True while the left-hand prop crossfade is actively running. The render
   * loop reads this to suppress the trail overlay's tip capture for that
   * color through the whole fade — tip geometry differs between prop types,
   * so stamping through the swap draws a straight-line artifact.
   */
  isLeftPropCrossfadeInProgress(): boolean;

  /** Right-hand counterpart of isLeftPropCrossfadeInProgress. */
  isRightPropCrossfadeInProgress(): boolean;

  /**
   * Load different prop types for the left and right props
   * @param leftPropType - Type of prop for the left hand
   * @param rightPropType - Type of prop for the right hand
   * @param darkMode - When provided, uses this instead of global dark mode state (for preview isolation)
   */
  loadPerColorPropTextures(
    leftPropType: string,
    rightPropType: string,
    darkMode?: boolean,
    colors?: TunnelPropColorPair | null
  ): Promise<void>;

  /**
   * Load prop images for an additional tunnel layer with per-hand prop types +
   * custom colors. Left and right carry independent prop types so each performer
   * (Performer Set) can wear a different prop per hand.
   * @param layerIndex - Additional layer index (0 = first additional layer)
   * @param leftPropType - Type of the left-hand prop
   * @param rightPropType - Type of the right-hand prop
   * @param leftColor - Hex color for the left prop
   * @param rightColor - Hex color for the right prop
   */
  loadAdditionalLayerPropTextures(
    layerIndex: number,
    leftPropType: string,
    rightPropType: string,
    leftColor: string,
    rightColor: string
  ): Promise<void>;

  /**
   * Load grid image for a specific grid mode
   * @param gridMode - Grid mode (e.g., "diamond", "box")
   */
  loadGridTexture(
    gridMode: string,
    showNonRadialPoints?: boolean
  ): Promise<void>;

  /**
   * Load glyph image for rendering letter + turns
   * @param svgString - SVG string of the complete glyph
   * @param width - SVG width
   * @param height - SVG height
   */
  loadGlyphTexture(
    svgString: string,
    width: number,
    height: number
  ): Promise<void>;

  /**
   * Capture current frame as ImageBitmap
   * Used for pre-rendering sequences to frames
   */
  captureFrame(): Promise<ImageBitmap>;

  /**
   * Destroy the renderer and clean up resources
   */
  destroy(): void;

  getCanvas(): HTMLCanvasElement | null;

  /**
   * Set Dark Mode for dark background
   * @param enabled - Whether Dark Mode is enabled
   * @param animate - Whether to animate the transition (default: true)
   */
  setDarkMode(enabled: boolean, animate?: boolean): void;

  /**
   * Check if background is currently transitioning
   * Used by render loop to continue rendering during smooth transitions
   */
  isBackgroundTransitioning(): boolean;

  /**
   * Get the dimensions of the currently loaded blue prop
   * Returns { width: 0, height: 0 } if no prop is loaded
   */
  getLeftPropDimensions(): { width: number; height: number };

  /**
   * Get the dimensions of the currently loaded red prop
   * Returns { width: 0, height: 0 } if no prop is loaded
   */
  getRightPropDimensions(): { width: number; height: number };
}
