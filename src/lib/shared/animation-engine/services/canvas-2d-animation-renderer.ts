/**
 * @deprecated Superseded by render-graph system (src/lib/shared/render-graph/).
 * The WebGL2Backend + WebGPUBackend handle prop rendering via the unified
 * FrameGraph. This file remains as the default code path until the
 * render-graph is promoted from behind its feature flag.
 *
 * Canvas2D Animation Renderer Implementation
 *
 * Pure Canvas2D renderer for animation visualization.
 * Replaces PixiJS WebGL rendering with simpler, leak-free Canvas2D.
 *
 * Why Canvas2D over PixiJS:
 * - Zero external dependencies
 * - No WebGL context management/loss issues
 * - Simpler memory lifecycle (no texture caching)
 * - Sufficient performance for ~10 sprites
 * - Easier debugging
 *
 * Architecture:
 * This class delegates to specialized services following SRP:
 * - Canvas2DApplicationManager: Canvas lifecycle and management
 * - Canvas2DImageLoader: SVG→Image conversion and caching
 * - Canvas2DTrailRenderer: Trail rendering logic
 * - Canvas2DFadeManager: Glyph fade transitions
 * - Canvas2DGridFadeManager: Grid visibility toggle transitions
 * - Canvas2DVisibilityFadeManager: Props and trails visibility transitions
 */
import type { TunnelPropColorPair } from "$lib/shared/sequence-viewer/tunnel/tunnel-prop-colors";

import type { RenderedPropTransform } from "$lib/shared/animation-engine/domain/types/fire-types";
import type { RenderedPropSprite } from "$lib/shared/animation-engine/domain/types/rendered-prop-sprite";
import type { RenderSceneParams } from "$lib/shared/animation-engine/domain/types/animation-render-types";

export type {
  AdditionalLayerRenderData,
  AnimationVisibilitySettings,
  RenderSceneParams,
} from "$lib/shared/animation-engine/domain/types/animation-render-types";
import { spotlightFactor } from "$lib/shared/sequence-viewer/tunnel/tunnel-prop-colors";
import { Canvas2DApplicationManager } from "$lib/shared/animation-engine/services/canvas2d/canvas-2d-application-manager";
import { Canvas2DImageLoader } from "$lib/shared/animation-engine/services/canvas2d/canvas-2d-image-loader";
import { propTextureMatchesRequest } from "$lib/shared/animation-engine/services/canvas2d/prop-texture-match";
import { Canvas2DTrailRenderer } from "$lib/shared/animation-engine/services/canvas2d/canvas-2d-trail-renderer";
import { Canvas2DFadeManager } from "$lib/shared/animation-engine/services/canvas2d/canvas-2d-fade-manager";
import { Canvas2DGridFadeManager } from "$lib/shared/animation-engine/services/canvas2d/canvas-2d-grid-fade-manager";
import { Canvas2DVisibilityFadeManager } from "./canvas2d/canvas-2d-visibility-fade-manager";
import { DURATION } from "$lib/shared/transitions/transitions";
import {
  lerp,
  lerpAngle,
} from "$lib/shared/animation-engine/services/angle-calculator";
import { wsEase } from "$lib/shared/transitions/ws-ease";

// Constants matching AnimatorCanvas EXACTLY
const VIEWBOX_SIZE = 950;
const GRID_HALFWAY_POINT_OFFSET = 150; // Strict hand points (animation mode)
const INWARD_FACTOR = 1.0; // No inward adjustment - use exact grid coordinates

/**
 * Move the outgoing and incoming sprites on one transform while their artwork
 * crossfades. The emphasized deceleration covers most of the distance early,
 * then settles onto the incoming live pose without overshoot.
 */
export function interpolatePropCrossfadeTransform(
  outgoing: RenderedPropTransform,
  incoming: RenderedPropTransform,
  progress: number
): RenderedPropTransform {
  const eased = wsEase(progress);
  return {
    centerX: lerp(outgoing.centerX, incoming.centerX, eased),
    centerY: lerp(outgoing.centerY, incoming.centerY, eased),
    angle: lerpAngle(outgoing.angle, incoming.angle, eased),
    scaleFactor: lerp(outgoing.scaleFactor, incoming.scaleFactor, eased),
  };
}

// ─── Screen-space sphere shading for spherical props ─────────────────
interface SphereDefinition {
  cx: number;
  cy: number;
  r: number;
}

interface SphereMaterial {
  edgeDarkness: number;
  specularIntensity: number;
  specularRadius: number;
}

interface SphereLayout {
  spheres: SphereDefinition[];
  viewBoxWidth: number;
  viewBoxHeight: number;
  material?: SphereMaterial;
}

// Sphere layouts by size+count (independent of material)
const SPHERE_LAYOUTS = {
  single: {
    spheres: [{ cx: 225, cy: 75, r: 75 }],
    viewBoxWidth: 300,
    viewBoxHeight: 150,
  },
  double: {
    spheres: [
      { cx: 75, cy: 75, r: 75 },
      { cx: 225, cy: 75, r: 75 },
    ],
    viewBoxWidth: 300,
    viewBoxHeight: 150,
  },
  bigsingle: {
    spheres: [{ cx: 450, cy: 150, r: 150 }],
    viewBoxWidth: 600,
    viewBoxHeight: 300,
  },
  bigdouble: {
    spheres: [
      { cx: 150, cy: 150, r: 150 },
      { cx: 450, cy: 150, r: 150 },
    ],
    viewBoxWidth: 600,
    viewBoxHeight: 300,
  },
};

// Default material (also used for "contact" standard balls)
const DEFAULT_SPHERE_MATERIAL: SphereMaterial = {
  edgeDarkness: 0.35,
  specularIntensity: 0.35,
  specularRadius: 0.4,
};

// Materials by surface type (independent of size/count)
const SPHERE_MATERIALS: Record<string, SphereMaterial> = {
  contact: DEFAULT_SPHERE_MATERIAL,
  glass: DEFAULT_SPHERE_MATERIAL,
  pmma: { edgeDarkness: 0.35, specularIntensity: 0.5, specularRadius: 0.4 },
  frosted: { edgeDarkness: 0.35, specularIntensity: 0.2, specularRadius: 0.6 },
};

// Pattern: {big?}{double?}{material}ball - parse any combination
const SPHERE_PROP_PATTERN = /^(big)?(double)?(contact|glass|pmma|frosted)ball$/;

function getSphereLayout(propType: string): SphereLayout | null {
  const match = propType.toLowerCase().match(SPHERE_PROP_PATTERN);
  if (!match) return null;

  const isBig = !!match[1];
  const isDouble = !!match[2];
  const materialKey = match[3]!;

  const layoutKey = (isBig ? "big" : "") + (isDouble ? "double" : "single");
  const base = SPHERE_LAYOUTS[layoutKey as keyof typeof SPHERE_LAYOUTS];
  const material = SPHERE_MATERIALS[materialKey] ?? DEFAULT_SPHERE_MATERIAL;

  return { ...base, material };
}

export class Canvas2DAnimationRenderer {
  // Specialized service managers
  private appManager: Canvas2DApplicationManager;
  private imageLoader: Canvas2DImageLoader;
  private trailRenderer: Canvas2DTrailRenderer;
  private fadeManager: Canvas2DFadeManager;
  private gridFadeManager: Canvas2DGridFadeManager;
  private propsFadeManager: Canvas2DVisibilityFadeManager;
  private leftPropFadeManager: Canvas2DVisibilityFadeManager;
  private rightPropFadeManager: Canvas2DVisibilityFadeManager;
  private trailsFadeManager: Canvas2DVisibilityFadeManager;
  // Prop-type hot-swap crossfade. Both sprites stay inside this renderer, so the
  // animation engine and canvas never remount. Independent clocks let one color
  // swap while the other remains steady. These are separate from the visibility
  // fade managers above, which respond to motion toggles.
  private leftPropCrossfadeManager: Canvas2DFadeManager;
  private rightPropCrossfadeManager: Canvas2DFadeManager;

  // Flipping is derived from the prop family outside the image loader. Snapshot
  // the outgoing value when a crossfade starts so an asymmetric outgoing prop
  // does not adopt the incoming prop's orientation during the overlap.
  private lastLeftPropFlipped = false;
  private lastRightPropFlipped = false;
  private previousLeftPropFlipped = false;
  private previousRightPropFlipped = false;

  // FLIP-style origin snapshots. These are captured before the sequence state
  // resets, then held through the async texture load and eased into the new
  // live pose once both sprites are ready.
  private leftPropCrossfadeOrigin: RenderedPropTransform | null = null;
  private rightPropCrossfadeOrigin: RenderedPropTransform | null = null;

  private lastLeftTransform: RenderedPropTransform | null = null;
  private lastRightTransform: RenderedPropTransform | null = null;
  private readonly lastRenderedPropSprites: RenderedPropSprite[] = [];

  // Track current grid mode for resize operations
  private currentGridMode: string = "diamond";

  // Cached off-white tinted grid for dark mode. ctx.filter("invert") is
  // silently ignored on iOS Safari, leaving the grid pure black and invisible
  // on the dark canvas. We pre-tint the grid on an offscreen canvas instead
  // (drawImage + "source-in" fill), which iOS does support. Rebuilt only when
  // the source grid image or canvas size changes.
  private tintedGridCanvas: HTMLCanvasElement | null = null;
  private tintedGridImageRef: HTMLImageElement | null = null;
  private tintedGridSize = 0;

  constructor() {
    this.appManager = new Canvas2DApplicationManager();
    this.imageLoader = new Canvas2DImageLoader();
    this.trailRenderer = new Canvas2DTrailRenderer();
    this.fadeManager = new Canvas2DFadeManager();
    this.gridFadeManager = new Canvas2DGridFadeManager();
    this.propsFadeManager = new Canvas2DVisibilityFadeManager(300, 200);
    // Individual blue/red fade managers use same timing for coordinated animation
    this.leftPropFadeManager = new Canvas2DVisibilityFadeManager(300, 200);
    this.rightPropFadeManager = new Canvas2DVisibilityFadeManager(300, 200);
    this.trailsFadeManager = new Canvas2DVisibilityFadeManager(350, 250);
    // A prop swap is an emphasized visual change, but it should finish before
    // two unrelated silhouettes read as one malformed object.
    this.leftPropCrossfadeManager = new Canvas2DFadeManager(DURATION.emphasis);
    this.rightPropCrossfadeManager = new Canvas2DFadeManager(DURATION.emphasis);
  }

  /**
   * Return an off-white tinted copy of the grid image for dark mode.
   *
   * Uses an offscreen canvas with "source-in" compositing rather than
   * ctx.filter — iOS Safari silently ignores CanvasRenderingContext2D.filter,
   * which left the grid pure black (invisible) on the dark animation canvas.
   * #d9d9d9 matches the old invert(0.85) output (0.85 * 255 ≈ 217). Cached
   * across frames; rebuilt only when the source image or size changes.
   */
  private getTintedGrid(
    gridImage: HTMLImageElement,
    canvasSize: number
  ): HTMLCanvasElement | null {
    if (
      this.tintedGridCanvas &&
      this.tintedGridImageRef === gridImage &&
      this.tintedGridSize === canvasSize
    ) {
      return this.tintedGridCanvas;
    }

    const offscreen = this.tintedGridCanvas ?? document.createElement("canvas");
    offscreen.width = canvasSize;
    offscreen.height = canvasSize;
    const offCtx = offscreen.getContext("2d");
    if (!offCtx) return null;

    offCtx.clearRect(0, 0, canvasSize, canvasSize);
    // 1. Draw the grid (black ink) as an alpha mask.
    offCtx.drawImage(gridImage, 0, 0, canvasSize, canvasSize);
    // 2. Recolor only the drawn pixels to off-white.
    offCtx.globalCompositeOperation = "source-in";
    offCtx.fillStyle = "#d9d9d9";
    offCtx.fillRect(0, 0, canvasSize, canvasSize);
    offCtx.globalCompositeOperation = "source-over";

    this.tintedGridCanvas = offscreen;
    this.tintedGridImageRef = gridImage;
    this.tintedGridSize = canvasSize;
    return offscreen;
  }

  async initialize(
    container: HTMLElement,
    size: number,
    backgroundAlpha: number = 1,
    paintBackground: boolean = true
  ): Promise<void> {
    await this.appManager.initialize(
      container,
      size,
      backgroundAlpha,
      paintBackground
    );
  }

  async resize(newSize: number): Promise<void> {
    this.appManager.resize(newSize);

    // Reload grid image at new canvas size
    await this.loadGridTexture(this.currentGridMode);
  }

  async loadPropTextures(propType: string): Promise<void> {
    await this.imageLoader.loadPropImages(propType);
  }

  async loadPerColorPropTextures(
    leftPropType: string,
    rightPropType: string,
    darkMode?: boolean,
    colors?: TunnelPropColorPair | null
  ): Promise<void> {
    await this.imageLoader.loadPerColorPropImages(
      leftPropType,
      rightPropType,
      darkMode,
      colors
    );
  }

  prepareLeftPropCrossfade(): void {
    this.leftPropCrossfadeOrigin = this.lastLeftTransform
      ? { ...this.lastLeftTransform }
      : null;
    this.previousLeftPropFlipped = this.lastLeftPropFlipped;
  }

  prepareRightPropCrossfade(): void {
    this.rightPropCrossfadeOrigin = this.lastRightTransform
      ? { ...this.lastRightTransform }
      : null;
    this.previousRightPropFlipped = this.lastRightPropFlipped;
  }

  /**
   * Start the blue-hand prop crossfade. Called by PropTypeManager from
   * a genuine hot-swap site only, once the new texture has already loaded —
   * never from the initial load or a dark-mode-only reload. No-op if the
   * image loader has no previous blue sprite to fade from (nothing swapped).
   */
  startLeftPropCrossfade(): void {
    if (this.imageLoader.getPreviousLeftProp()) {
      // Settings-driven changes can call the renderer without a sequence
      // reset. In that path the latest painted transform is a valid fallback.
      this.leftPropCrossfadeOrigin ??= this.lastLeftTransform
        ? { ...this.lastLeftTransform }
        : null;
      this.leftPropCrossfadeManager.startFadeTransition();
    }
  }

  /** Red-hand counterpart of startBluePropCrossfade. */
  startRightPropCrossfade(): void {
    if (this.imageLoader.getPreviousRightProp()) {
      this.rightPropCrossfadeOrigin ??= this.lastRightTransform
        ? { ...this.lastRightTransform }
        : null;
      this.rightPropCrossfadeManager.startFadeTransition();
    }
  }

  /**
   * True while the blue-hand prop crossfade is actively running.
   * Consumed by the trail overlay (via AnimationRenderLoop) to suppress new
   * tip captures for that color during the fade — the tip's screen position
   * jumps between prop types' differing tip geometry, and stamping through
   * that jump is what drew the reported straight-line artifact.
   */
  isLeftPropCrossfadeInProgress(): boolean {
    return this.leftPropCrossfadeManager.isFadingInProgress();
  }

  /** Red-hand counterpart of isBluePropCrossfadeInProgress. */
  isRightPropCrossfadeInProgress(): boolean {
    return this.rightPropCrossfadeManager.isFadingInProgress();
  }

  async loadAdditionalLayerPropTextures(
    layerIndex: number,
    leftPropType: string,
    rightPropType: string,
    leftColor: string,
    rightColor: string
  ): Promise<void> {
    await this.imageLoader.loadAdditionalLayerPropImages(
      layerIndex,
      leftPropType,
      rightPropType,
      leftColor,
      rightColor
    );
  }

  async loadGridTexture(
    gridMode: string,
    showNonRadialPoints: boolean = true
  ): Promise<void> {
    this.currentGridMode = gridMode;
    const canvasSize = this.appManager.getCurrentSize();
    await this.imageLoader.loadGridImage(
      gridMode,
      canvasSize,
      showNonRadialPoints
    );
  }

  /**
   * Set Dark Mode for dark background
   * @param animate - Whether to animate the transition (default: true)
   */
  setDarkMode(enabled: boolean, animate: boolean = true): void {
    this.appManager.setDarkMode(enabled, animate);
  }

  /**
   * Check if any element is currently transitioning
   * Used by render loop to continue rendering during smooth transitions
   */
  isBackgroundTransitioning(): boolean {
    return (
      this.appManager.isBackgroundTransitioning() ||
      this.gridFadeManager.isTransitionInProgress() ||
      this.propsFadeManager.isTransitionInProgress() ||
      this.leftPropFadeManager.isTransitionInProgress() ||
      this.rightPropFadeManager.isTransitionInProgress() ||
      this.trailsFadeManager.isTransitionInProgress() ||
      this.leftPropCrossfadeManager.isFadingInProgress() ||
      this.rightPropCrossfadeManager.isFadingInProgress()
    );
  }

  async loadGlyphTexture(
    svgString: string,
    width: number,
    height: number
  ): Promise<void> {
    const { previous } = await this.imageLoader.loadGlyphImage(
      svgString,
      width,
      height
    );

    // Start fade transition if there's a previous glyph
    if (previous) {
      this.fadeManager.startFadeTransition();
    }
  }

  renderScene(params: RenderSceneParams): void {
    this.lastRenderedPropSprites.length = 0;
    const paintedTunnelOpacities: number[] = [];
    const ctx = this.appManager.getContext();
    if (!ctx || !this.appManager.isReady()) {
      return;
    }

    const canvasSize = this.appManager.getCurrentSize();
    this.lastLeftTransform = null;
    this.lastRightTransform = null;
    const gridScaleFactor = canvasSize / VIEWBOX_SIZE;

    // 1. Clear canvas and fill background
    this.appManager.clear();

    // 2. Draw grid (with fade transition for toggle)
    this.gridFadeManager.setVisible(params.visibility.gridVisible);
    const gridFadeState = this.gridFadeManager.updateProgress(
      params.currentTime
    );
    const gridAlpha =
      params.gridOpacity === undefined
        ? gridFadeState.alpha
        : Math.max(0, Math.min(1, params.gridOpacity));
    const gridImage = this.imageLoader.getGridImage();

    // Draw grid if alpha > 0 (either visible, or fading out)
    if (gridAlpha > 0 && gridImage) {
      ctx.save();
      ctx.globalAlpha = gridAlpha;

      // In Dark Mode the grid (black ink) must render off-white. ctx.filter is
      // unsupported on iOS Safari, so we draw a pre-tinted offscreen copy
      // instead of inverting at draw time (which left the grid black on iPhone).
      const isDarkMode = this.appManager.isDarkModeEnabled();
      const tinted = isDarkMode
        ? this.getTintedGrid(gridImage, canvasSize)
        : null;
      ctx.drawImage(tinted ?? gridImage, 0, 0, canvasSize, canvasSize);
      ctx.restore();
    }

    // 3. Draw trails (with fade transition for toggle)
    this.trailsFadeManager.setVisible(params.visibility.trailsVisible);
    const trailsFadeState = this.trailsFadeManager.updateProgress(
      params.currentTime
    );

    if (trailsFadeState.alpha > 0 && !params.skipTrailRendering) {
      ctx.save();
      ctx.globalAlpha = trailsFadeState.alpha;
      this.trailRenderer.renderTrails(
        ctx,
        params.leftTrailPoints,
        params.rightTrailPoints,
        params.trailSettings,
        params.currentTime,
        !!params.leftProp && params.visibility.leftMotionVisible,
        !!params.rightProp && params.visibility.rightMotionVisible,
        canvasSize,
        params.qualityHints,
        params.additionalLayers
      );
      ctx.restore();
    }

    // 4. Draw props (with fade transitions for toggles)
    // Overall props toggle affects all props
    this.propsFadeManager.setVisible(
      params.visibility.propsVisible && !params.trailSettings.hideProps
    );
    const propsFadeState = this.propsFadeManager.updateProgress(
      params.currentTime
    );

    // Individual motion toggles for blue/red (combined with overall props alpha)
    this.leftPropFadeManager.setVisible(params.visibility.leftMotionVisible);
    this.rightPropFadeManager.setVisible(params.visibility.rightMotionVisible);
    const leftFadeState = this.leftPropFadeManager.updateProgress(
      params.currentTime
    );
    const rightFadeState = this.rightPropFadeManager.updateProgress(
      params.currentTime
    );

    // Blue props: render if either fade has alpha > 0
    const leftAlpha = propsFadeState.alpha * leftFadeState.alpha;
    // Performer spotlight: base = family 0, layer i = family i+1. Dims the prop
    // glyph of every non-selected copy so the chosen performer stands out.
    const selectedLayer = params.tunnelSelectedLayer ?? null;
    if (leftAlpha > 0 && params.leftProp) {
      ctx.save();
      const leftBaseAlpha = leftAlpha * spotlightFactor(selectedLayer, 0);
      ctx.globalAlpha = leftBaseAlpha;

      // Primary blue prop. A reroll captures the last painted transform before
      // the sequence resets. Hold that pose while the texture loads, then move
      // both silhouettes together toward the incoming live pose.
      const leftPropImage = this.imageLoader.getLeftPropImage();
      const previousLeftProp = this.imageLoader.getPreviousLeftProp();
      const leftCrossfade = this.leftPropCrossfadeManager.updateFadeProgress(
        params.currentTime
      );
      if (leftPropImage) {
        const leftFlipped = params.leftPropFlipped ?? false;
        const leftGeometry = this.calculatePropTransform(
          params.leftProp,
          params.leftPropDimensions,
          canvasSize
        );
        const leftLiveTransform: RenderedPropTransform = {
          centerX: leftGeometry.x,
          centerY: leftGeometry.y,
          angle:
            params.leftPropType?.toLowerCase() === "hand"
              ? 0
              : leftGeometry.rotation,
          scaleFactor: gridScaleFactor,
        };
        const loadedLeftType = this.imageLoader.getLeftPropType();
        const leftTextureMatchesRequest = propTextureMatchesRequest({
          loaded: loadedLeftType,
          requested: this.imageLoader.getRequestedLeftPropType(),
          paramsPropType: params.leftPropType,
        });
        const leftCrossfadeActive =
          previousLeftProp != null && !leftCrossfade.isComplete;
        const leftSharedTransform =
          this.leftPropCrossfadeOrigin && !leftTextureMatchesRequest
            ? this.leftPropCrossfadeOrigin
            : this.leftPropCrossfadeOrigin && leftCrossfadeActive
              ? interpolatePropCrossfadeTransform(
                  this.leftPropCrossfadeOrigin,
                  leftLiveTransform,
                  leftCrossfade.currentAlpha
                )
              : leftLiveTransform;
        this.lastLeftTransform = leftSharedTransform;

        if (leftCrossfadeActive) {
          ctx.globalAlpha = leftBaseAlpha * leftCrossfade.previousAlpha;
          this.renderPropAtTransform(
            ctx,
            previousLeftProp.image,
            previousLeftProp.dimensions,
            leftSharedTransform,
            this.previousLeftPropFlipped,
            previousLeftProp.propType
          );
          this.renderSphereShading(
            ctx,
            params.leftProp,
            previousLeftProp.dimensions,
            canvasSize,
            previousLeftProp.propType,
            leftSharedTransform
          );

          ctx.globalAlpha = leftBaseAlpha * leftCrossfade.currentAlpha;
          this.renderPropAtTransform(
            ctx,
            leftPropImage,
            params.leftPropDimensions,
            leftSharedTransform,
            leftFlipped,
            params.leftPropType
          );
          if (params.leftPropType) {
            this.renderSphereShading(
              ctx,
              params.leftProp,
              params.leftPropDimensions,
              canvasSize,
              params.leftPropType,
              leftSharedTransform
            );
          }
        } else {
          const displayedLeftDimensions = leftTextureMatchesRequest
            ? params.leftPropDimensions
            : this.imageLoader.getLeftPropDimensions();
          const displayedLeftType = leftTextureMatchesRequest
            ? params.leftPropType
            : (loadedLeftType ?? params.leftPropType);
          this.renderPropAtTransform(
            ctx,
            leftPropImage,
            displayedLeftDimensions,
            leftSharedTransform,
            leftTextureMatchesRequest
              ? leftFlipped
              : this.previousLeftPropFlipped,
            displayedLeftType
          );
          if (displayedLeftType) {
            this.renderSphereShading(
              ctx,
              params.leftProp,
              displayedLeftDimensions,
              canvasSize,
              displayedLeftType,
              leftSharedTransform
            );
          }
        }
        // During the async load gap, frame params already describe the incoming
        // type while the canvas still holds the outgoing image. Preserve the
        // outgoing flip until the loaded texture matches those params.
        if (leftTextureMatchesRequest) {
          this.lastLeftPropFlipped = leftFlipped;
        }
        ctx.globalAlpha = leftBaseAlpha;
      }
      if (leftCrossfade.isComplete && previousLeftProp) {
        this.imageLoader.clearPreviousLeftProp();
        this.leftPropCrossfadeOrigin = null;
      }

      // Additional tunnel layer blue props — tinted to their spectrum color so
      // each kaleidoscope copy is distinct (blue family fans blue→green). Each
      // layer draws at its OWN intrinsic dimensions (a performer's per-hand prop
      // may be a different shape than the base pair), falling back to the base
      // dimensions before its texture has loaded.
      if (params.additionalLayers) {
        const layerCount = params.additionalLayers.length;
        for (let i = 0; i < layerCount; i++) {
          const layer = params.additionalLayers[i]!;
          if (layer.leftProp && layer.hasLeft) {
            const layerImages = this.imageLoader.getAdditionalLayerImages(i);
            if (layerImages.left) {
              const dims = this.imageLoader.getAdditionalLayerDimensions(i);
              ctx.globalAlpha =
                leftAlpha *
                layer.opacity *
                spotlightFactor(selectedLayer, i + 1);
              this.renderProp(
                ctx,
                layer.leftProp,
                layerImages.left,
                dims?.left ?? params.leftPropDimensions,
                canvasSize,
                params.leftPropFlipped ?? false,
                layer.leftPropType ?? params.leftPropType
              );
              paintedTunnelOpacities.push(ctx.globalAlpha);
            }
          }
        }
      }

      ctx.restore();
    }

    // Red props: render if either fade has alpha > 0
    const rightAlpha = propsFadeState.alpha * rightFadeState.alpha;
    if (rightAlpha > 0 && params.rightProp) {
      ctx.save();
      const rightBaseAlpha = rightAlpha * spotlightFactor(selectedLayer, 0);
      ctx.globalAlpha = rightBaseAlpha;

      // Primary red prop: same captured-origin bridge as blue above.
      const rightPropImage = this.imageLoader.getRightPropImage();
      const previousRightProp = this.imageLoader.getPreviousRightProp();
      const rightCrossfade = this.rightPropCrossfadeManager.updateFadeProgress(
        params.currentTime
      );
      if (rightPropImage) {
        const rightFlipped = params.rightPropFlipped ?? false;
        const rightGeometry = this.calculatePropTransform(
          params.rightProp,
          params.rightPropDimensions,
          canvasSize
        );
        const rightLiveTransform: RenderedPropTransform = {
          centerX: rightGeometry.x,
          centerY: rightGeometry.y,
          angle:
            params.rightPropType?.toLowerCase() === "hand"
              ? 0
              : rightGeometry.rotation,
          scaleFactor: gridScaleFactor,
        };
        const loadedRightType = this.imageLoader.getRightPropType();
        const rightTextureMatchesRequest = propTextureMatchesRequest({
          loaded: loadedRightType,
          requested: this.imageLoader.getRequestedRightPropType(),
          paramsPropType: params.rightPropType,
        });
        const rightCrossfadeActive =
          previousRightProp != null && !rightCrossfade.isComplete;
        const rightSharedTransform =
          this.rightPropCrossfadeOrigin && !rightTextureMatchesRequest
            ? this.rightPropCrossfadeOrigin
            : this.rightPropCrossfadeOrigin && rightCrossfadeActive
              ? interpolatePropCrossfadeTransform(
                  this.rightPropCrossfadeOrigin,
                  rightLiveTransform,
                  rightCrossfade.currentAlpha
                )
              : rightLiveTransform;
        this.lastRightTransform = rightSharedTransform;

        if (rightCrossfadeActive) {
          ctx.globalAlpha = rightBaseAlpha * rightCrossfade.previousAlpha;
          this.renderPropAtTransform(
            ctx,
            previousRightProp.image,
            previousRightProp.dimensions,
            rightSharedTransform,
            this.previousRightPropFlipped,
            previousRightProp.propType
          );
          this.renderSphereShading(
            ctx,
            params.rightProp,
            previousRightProp.dimensions,
            canvasSize,
            previousRightProp.propType,
            rightSharedTransform
          );

          ctx.globalAlpha = rightBaseAlpha * rightCrossfade.currentAlpha;
          this.renderPropAtTransform(
            ctx,
            rightPropImage,
            params.rightPropDimensions,
            rightSharedTransform,
            rightFlipped,
            params.rightPropType
          );
          if (params.rightPropType) {
            this.renderSphereShading(
              ctx,
              params.rightProp,
              params.rightPropDimensions,
              canvasSize,
              params.rightPropType,
              rightSharedTransform
            );
          }
        } else {
          const displayedRightDimensions = rightTextureMatchesRequest
            ? params.rightPropDimensions
            : this.imageLoader.getRightPropDimensions();
          const displayedRightType = rightTextureMatchesRequest
            ? params.rightPropType
            : (loadedRightType ?? params.rightPropType);
          this.renderPropAtTransform(
            ctx,
            rightPropImage,
            displayedRightDimensions,
            rightSharedTransform,
            rightTextureMatchesRequest
              ? rightFlipped
              : this.previousRightPropFlipped,
            displayedRightType
          );
          if (displayedRightType) {
            this.renderSphereShading(
              ctx,
              params.rightProp,
              displayedRightDimensions,
              canvasSize,
              displayedRightType,
              rightSharedTransform
            );
          }
        }
        if (rightTextureMatchesRequest) {
          this.lastRightPropFlipped = rightFlipped;
        }
        ctx.globalAlpha = rightBaseAlpha;
      }
      if (rightCrossfade.isComplete && previousRightProp) {
        this.imageLoader.clearPreviousRightProp();
        this.rightPropCrossfadeOrigin = null;
      }

      // Additional tunnel layer red props — tinted to their spectrum color so
      // each kaleidoscope copy is distinct (red family fans red→magenta). Own
      // intrinsic dimensions per performer, base fallback before texture load.
      if (params.additionalLayers) {
        const layerCount = params.additionalLayers.length;
        for (let i = 0; i < layerCount; i++) {
          const layer = params.additionalLayers[i]!;
          if (layer.rightProp && layer.hasRight) {
            const layerImages = this.imageLoader.getAdditionalLayerImages(i);
            if (layerImages.right) {
              const dims = this.imageLoader.getAdditionalLayerDimensions(i);
              ctx.globalAlpha =
                rightAlpha *
                layer.opacity *
                spotlightFactor(selectedLayer, i + 1);
              this.renderProp(
                ctx,
                layer.rightProp,
                layerImages.right,
                dims?.right ?? params.rightPropDimensions,
                canvasSize,
                params.rightPropFlipped ?? false,
                layer.rightPropType ?? params.rightPropType
              );
              paintedTunnelOpacities.push(ctx.globalAlpha);
            }
          }
        }
      }

      ctx.restore();
    }

    // 5. Draw glyph (with fade transition)
    this.renderGlyph(ctx, params.currentTime, canvasSize);
    this.publishTunnelPaintTelemetry(
      paintedTunnelOpacities,
      Math.max(
        0,
        ...(params.additionalLayers?.map((layer) => layer.opacity) ?? [])
      )
    );
  }

  /**
   * Publish completed Tunnel draw calls only while the transition review asks.
   *
   * Reading a live canvas buffer races the renderer's clear/draw tasks and can
   * report a transparent frame that was never presented. These values are
   * recorded immediately after each additional prop's `drawImage`, so they
   * describe the paint work that produced the composited frame without adding
   * a production DOM write on ordinary playback.
   */
  private publishTunnelPaintTelemetry(
    opacities: number[],
    progress: number
  ): void {
    const capture = document.documentElement;
    if (capture.dataset.captureTunnelPaint !== "true") return;
    const frame = (Number(capture.dataset.tunnelPaintFrame) || 0) + 1;
    const mean =
      opacities.length === 0
        ? 0
        : opacities.reduce((total, opacity) => total + opacity, 0) /
          opacities.length;
    const perceptible = opacities.filter((opacity) => opacity >= 0.1).length;
    capture.dataset.tunnelPaintFrame = String(frame);
    capture.dataset.tunnelPaintedPropCount = String(opacities.length);
    capture.dataset.tunnelPaintedPerceptiblePropCount = String(perceptible);
    capture.dataset.tunnelPaintedOpacityMean = mean.toFixed(3);

    const entry = [
      performance.now().toFixed(1),
      progress.toFixed(3),
      opacities.length,
      perceptible,
      mean.toFixed(3),
    ].join(",");
    const history = capture.dataset.tunnelPaintHistory
      ? capture.dataset.tunnelPaintHistory.split(";")
      : [];
    history.push(entry);
    capture.dataset.tunnelPaintHistory = history.slice(-240).join(";");
  }

  getLastPropTransforms(): {
    left: RenderedPropTransform | null;
    right: RenderedPropTransform | null;
  } {
    return { left: this.lastLeftTransform, right: this.lastRightTransform };
  }

  getLastRenderedPropSprites(): readonly RenderedPropSprite[] {
    return this.lastRenderedPropSprites;
  }

  /** Current prop sprite images — the echo overlay ghosts these at past poses. */
  getPropImages(): {
    left: HTMLImageElement | null;
    right: HTMLImageElement | null;
  } {
    return {
      left: this.imageLoader.getLeftPropImage(),
      right: this.imageLoader.getRightPropImage(),
    };
  }

  /**
   * Render a prop at its calculated position with rotation
   * @param flipped - Whether to mirror the prop horizontally (for asymmetric props like Buugeng)
   * @param propType - The type of prop being rendered (used for prop-specific rules like hands never rotating)
   */
  private renderProp(
    ctx: CanvasRenderingContext2D,
    propState: {
      centerPathAngle: number;
      staffRotationAngle: number;
      x?: number;
      y?: number;
    },
    image: HTMLImageElement | null,
    dimensions: { width: number; height: number },
    canvasSize: number,
    flipped: boolean = false,
    propType?: string
  ): void {
    if (!image) return;

    const transform = this.calculatePropTransform(
      propState,
      dimensions,
      canvasSize
    );

    // IMPORTANT: Hands should never rotate - always use default orientation (0 degrees)
    // This matches the static pictograph behavior in PropPlacer.ts
    const rotation =
      propType?.toLowerCase() === "hand" ? 0 : transform.rotation;

    this.renderPropAtTransform(
      ctx,
      image,
      dimensions,
      {
        centerX: transform.x,
        centerY: transform.y,
        angle: rotation,
        scaleFactor: canvasSize / VIEWBOX_SIZE,
      },
      flipped,
      propType
    );
  }

  /** Draw a sprite at an already-resolved canvas transform. Crossfading props
   *  both use this path so opacity can change without producing two poses. */
  private renderPropAtTransform(
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement | null,
    dimensions: { width: number; height: number },
    transform: RenderedPropTransform,
    flipped: boolean = false,
    propType?: string
  ): void {
    if (!image) return;

    // Every prop sprite is already colored by the SVG pipeline, so it draws
    // directly at its own intrinsic bounds.
    const width = dimensions.width * transform.scaleFactor;
    const height = dimensions.height * transform.scaleFactor;
    const rotation = propType?.toLowerCase() === "hand" ? 0 : transform.angle;

    this.lastRenderedPropSprites.push({
      image,
      centerX: transform.centerX,
      centerY: transform.centerY,
      angle: rotation,
      width,
      height,
      flipped,
      opacity: ctx.globalAlpha,
    });

    ctx.save();
    ctx.translate(transform.centerX, transform.centerY);
    ctx.rotate(rotation);

    // Apply horizontal flip for asymmetric props (Buugeng family)
    if (flipped) {
      ctx.scale(-1, 1);
    }

    ctx.drawImage(image, -width / 2, -height / 2, width, height);

    ctx.restore();
  }

  /**
   * Draw screen-space sphere shading (edge darkening + specular highlight)
   * at each sub-sphere's position WITHOUT rotation, so the highlight
   * stays fixed relative to the viewer as the prop spins.
   */
  private renderSphereShading(
    ctx: CanvasRenderingContext2D,
    propState: {
      centerPathAngle: number;
      staffRotationAngle: number;
      x?: number;
      y?: number;
    },
    dimensions: { width: number; height: number },
    canvasSize: number,
    propType: string,
    renderedTransform?: RenderedPropTransform
  ): void {
    const config = getSphereLayout(propType);
    if (!config) return;

    const liveTransform = this.calculatePropTransform(
      propState,
      dimensions,
      canvasSize
    );
    const centerX = renderedTransform?.centerX ?? liveTransform.x;
    const centerY = renderedTransform?.centerY ?? liveTransform.y;
    const rotation = renderedTransform?.angle ?? liveTransform.rotation;
    const gridScaleFactor =
      renderedTransform?.scaleFactor ?? canvasSize / VIEWBOX_SIZE;
    const material = config.material ?? DEFAULT_SPHERE_MATERIAL;

    const vbCenterX = config.viewBoxWidth / 2;
    const vbCenterY = config.viewBoxHeight / 2;
    const cosR = Math.cos(rotation);
    const sinR = Math.sin(rotation);

    for (const sphere of config.spheres) {
      // Sphere offset from viewBox center, scaled to canvas space
      const offsetX = (sphere.cx - vbCenterX) * gridScaleFactor;
      const offsetY = (sphere.cy - vbCenterY) * gridScaleFactor;

      // Rotate offset by prop rotation to get screen position
      const screenX = centerX + offsetX * cosR - offsetY * sinR;
      const screenY = centerY + offsetX * sinR + offsetY * cosR;
      const screenR = sphere.r * gridScaleFactor;

      // Edge darkening: centered radial gradient, transparent core → dark rim
      const edgeGrad = ctx.createRadialGradient(
        screenX,
        screenY,
        screenR * 0.7,
        screenX,
        screenY,
        screenR
      );
      edgeGrad.addColorStop(0, "rgba(0,0,0,0)");
      edgeGrad.addColorStop(1, `rgba(0,0,0,${material.edgeDarkness})`);
      ctx.fillStyle = edgeGrad;
      ctx.beginPath();
      ctx.arc(screenX, screenY, screenR, 0, Math.PI * 2);
      ctx.fill();

      // Specular highlight: off-center at fixed upper-left, no rotation
      const specCenterX = screenX + -0.3 * screenR;
      const specCenterY = screenY + -0.3 * screenR;
      const specGradRadius = material.specularRadius * screenR;

      const specGrad = ctx.createRadialGradient(
        specCenterX,
        specCenterY,
        0,
        specCenterX,
        specCenterY,
        specGradRadius
      );
      specGrad.addColorStop(
        0,
        `rgba(255,255,255,${material.specularIntensity})`
      );
      specGrad.addColorStop(
        0.4,
        `rgba(255,255,255,${(material.specularIntensity * 0.23).toFixed(3)})`
      );
      specGrad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = specGrad;
      ctx.beginPath();
      ctx.arc(screenX, screenY, screenR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * Calculate prop position and dimensions
   * Matches PixiPropRenderer logic for consistency
   */
  private calculatePropTransform(
    propState: {
      centerPathAngle: number;
      staffRotationAngle: number;
      x?: number;
      y?: number;
    },
    propDimensions: { width: number; height: number },
    canvasSize: number
  ): {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  } {
    const centerX = canvasSize / 2;
    const centerY = canvasSize / 2;
    const gridScaleFactor = canvasSize / VIEWBOX_SIZE;
    const scaledHalfwayRadius = GRID_HALFWAY_POINT_OFFSET * gridScaleFactor;

    let x: number, y: number;

    if (propState.x !== undefined && propState.y !== undefined) {
      // Dash motion: use Cartesian coordinates
      x = centerX + propState.x * scaledHalfwayRadius * INWARD_FACTOR;
      y = centerY + propState.y * scaledHalfwayRadius * INWARD_FACTOR;
    } else {
      // Regular motion: calculate from angle
      x =
        centerX +
        Math.cos(propState.centerPathAngle) *
          scaledHalfwayRadius *
          INWARD_FACTOR;
      y =
        centerY +
        Math.sin(propState.centerPathAngle) *
          scaledHalfwayRadius *
          INWARD_FACTOR;
    }

    // Scale prop dimensions
    const propWidth = propDimensions.width * gridScaleFactor;
    const propHeight = propDimensions.height * gridScaleFactor;

    return {
      x,
      y,
      width: propWidth,
      height: propHeight,
      rotation: propState.staffRotationAngle,
    };
  }

  /**
   * Render glyph with fade transition support
   */
  private renderGlyph(
    ctx: CanvasRenderingContext2D,
    currentTime: number,
    canvasSize: number
  ): void {
    const currentImage = this.imageLoader.getGlyphImage();
    const previousImage = this.imageLoader.getPreviousGlyphImage();

    // Get fade state
    const fadeState = this.fadeManager.updateFadeProgress(currentTime);

    // Dark-mode glyph recoloring is baked into the serialized glyph SVG itself
    // (TKAGlyph swaps the letter <image> to a white-recolored source), so the
    // canvas draws the image as-is. The live viewer's glyph is the DOM overlay.

    // Draw previous glyph (fading out)
    if (previousImage && !fadeState.isComplete) {
      ctx.save();
      ctx.globalAlpha = fadeState.previousAlpha;
      ctx.drawImage(previousImage, 0, 0, canvasSize, canvasSize);
      ctx.restore();
    }

    // Draw current glyph
    if (currentImage) {
      ctx.save();
      ctx.globalAlpha = fadeState.isComplete ? 1 : fadeState.currentAlpha;
      ctx.drawImage(currentImage, 0, 0, canvasSize, canvasSize);
      ctx.restore();
    }

    // Clear previous glyph reference when fade completes
    if (fadeState.isComplete && previousImage) {
      this.imageLoader.clearPreviousGlyphImage();
    }
  }

  async captureFrame(): Promise<ImageBitmap> {
    return this.appManager.captureFrame();
  }

  getCanvas(): HTMLCanvasElement | null {
    return this.appManager.getCanvas();
  }

  getLeftPropDimensions(): { width: number; height: number } {
    return this.imageLoader.getLeftPropDimensions();
  }

  getRightPropDimensions(): { width: number; height: number } {
    return this.imageLoader.getRightPropDimensions();
  }

  /**
   * Render keys of the sprites currently on the canvas. Effects resolve tip
   * points from these so flames follow the painted artwork (a fan build, a
   * model sprite) rather than the notation glyph.
   */
  getLoadedPropRenderKeys(): { left: string | null; right: string | null } {
    return {
      left: this.imageLoader.getLeftPropType(),
      right: this.imageLoader.getRightPropType(),
    };
  }

  destroy(): void {
    this.fadeManager.reset();
    this.gridFadeManager.reset();
    this.propsFadeManager.reset();
    this.leftPropFadeManager.reset();
    this.rightPropFadeManager.reset();
    this.trailsFadeManager.reset();
    this.leftPropCrossfadeManager.reset();
    this.rightPropCrossfadeManager.reset();
    this.lastLeftPropFlipped = false;
    this.lastRightPropFlipped = false;
    this.previousLeftPropFlipped = false;
    this.previousRightPropFlipped = false;
    this.leftPropCrossfadeOrigin = null;
    this.rightPropCrossfadeOrigin = null;
    this.imageLoader.destroy();
    this.appManager.destroy();
    this.tintedGridCanvas = null;
    this.tintedGridImageRef = null;
  }
}
