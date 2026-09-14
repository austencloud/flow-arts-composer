import {
  generateLeftPropSvg,
  generateRightPropSvg,
  generatePropSvg,
  generateGridSvg,
} from "$lib/shared/animation-engine/services/svg-generator";
import { hashString } from "$lib/shared/foundation/services/content-hasher";
import { getSvgImageCache } from "$lib/shared/render/services/svg-image-cache";
import type { TunnelPropColorPair } from "$lib/shared/sequence-viewer/tunnel/tunnel-prop-colors";

/**
 * Canvas2D Image Loader
 *
 * Handles SVG-to-HTMLImageElement conversion and caching:
 * - Prop image loading
 * - Grid image loading
 * - Glyph image loading
 * - Memory-safe image lifecycle
 *
 * Single Responsibility: Image loading and management
 */

const VIEWBOX_SIZE = 950;

/**
 * Grid sprites are shared across every canvas on the page: nine animator
 * canvases showing the same grid mode at the same size decode it once between
 * them. Module scope rather than per-instance is the whole point.
 *
 * The SVG text depends only on the mode and the point set; the decoded raster
 * additionally depends on the size. Dragging a split walks through many sizes,
 * so the sprite cache is capped and evicts oldest-first — Map preserves
 * insertion order, which is all the recency this needs.
 */
const GRID_SVG_CACHE = new Map<string, string>();
const GRID_SPRITE_CACHE = new Map<string, HTMLImageElement>();
const MAX_GRID_SPRITES = 24;

function rememberGridSprite(key: string, image: HTMLImageElement): void {
  GRID_SPRITE_CACHE.set(key, image);
  while (GRID_SPRITE_CACHE.size > MAX_GRID_SPRITES) {
    const oldest = GRID_SPRITE_CACHE.keys().next();
    if (oldest.done) break;
    GRID_SPRITE_CACHE.delete(oldest.value);
  }
}

export interface PropSpriteSnapshot {
  image: HTMLImageElement;
  dimensions: { width: number; height: number };
  propType: string;
}

export class Canvas2DImageLoader {
  private primaryColorRequest: symbol | null = null;
  private layerColorRequests = new Map<number, symbol>();
  // Image cache
  private leftPropImage: HTMLImageElement | null = null;
  private rightPropImage: HTMLImageElement | null = null;
  private gridImage: HTMLImageElement | null = null;
  private glyphImage: HTMLImageElement | null = null;
  private previousGlyphImage: HTMLImageElement | null = null;
  // A crossfade needs the complete outgoing visual, not just its image. Keeping
  // the old dimensions and type in the same snapshot prevents the outgoing prop
  // from snapping into the incoming prop's bounds before its opacity reaches 0.
  // Stashing a snapshot does not itself start a fade: PropTypeManager decides
  // whether a load represents a genuine hot-swap.
  private previousLeftProp: PropSpriteSnapshot | null = null;
  private previousRightProp: PropSpriteSnapshot | null = null;

  // Additional tunnel layer prop images (lazily populated)
  private additionalLayerImages: Array<{
    left: HTMLImageElement | null;
    right: HTMLImageElement | null;
  }> = [];

  // Per-layer intrinsic prop dimensions (from each layer's SVG viewBox). A
  // performer wearing a different-shaped prop (sword vs staff) must draw at its
  // OWN dimensions, not the base pair's, or the sprite stretches. Index-aligned
  // with additionalLayerImages.
  private additionalLayerDimensions: Array<{
    left: { width: number; height: number };
    right: { width: number; height: number };
  }> = [];

  // Track prop dimensions (from SVG viewBox)
  private leftPropDimensions: { width: number; height: number } = {
    width: 0,
    height: 0,
  };
  private rightPropDimensions: { width: number; height: number } = {
    width: 0,
    height: 0,
  };
  private leftPropType: string | null = null;
  private rightPropType: string | null = null;

  async loadPropImages(propType: string): Promise<{
    left: HTMLImageElement;
    right: HTMLImageElement;
  }> {
    try {
      // Generate blue and red prop SVGs
      const [leftPropData, rightPropData] = await Promise.all([
        generateLeftPropSvg(propType),
        generateRightPropSvg(propType),
      ]);

      // Create new images BEFORE releasing old ones
      const [newLeftImage, newRightImage] = await Promise.all([
        this.createPropImageFromSVG(
          leftPropData.svg,
          leftPropData.width,
          leftPropData.height
        ),
        this.createPropImageFromSVG(
          rightPropData.svg,
          rightPropData.width,
          rightPropData.height
        ),
      ]);

      // Store dimensions
      this.leftPropDimensions = {
        width: leftPropData.width,
        height: leftPropData.height,
      };
      this.rightPropDimensions = {
        width: rightPropData.width,
        height: rightPropData.height,
      };
      this.leftPropType = propType;
      this.rightPropType = propType;

      // Swap references (old images will be garbage collected)
      this.leftPropImage = newLeftImage;
      this.rightPropImage = newRightImage;

      return {
        left: this.leftPropImage,
        right: this.rightPropImage,
      };
    } catch (error) {
      console.error("[Canvas2DImageLoader] Failed to load prop images:", error);
      throw error;
    }
  }

  async loadPerColorPropImages(
    leftPropType: string,
    rightPropType: string,
    darkMode?: boolean,
    colors?: TunnelPropColorPair | null
  ): Promise<{
    left: HTMLImageElement;
    right: HTMLImageElement;
  }> {
    const request = Symbol();
    this.primaryColorRequest = request;
    try {
      // Generate blue and red prop SVGs with different types
      // Pass darkMode to use local preview state instead of global
      const [leftPropData, rightPropData] = await Promise.all([
        colors
          ? generatePropSvg(
              leftPropType,
              colors.left,
              darkMode === undefined ? undefined : darkMode ? "dark" : "light"
            )
          : generateLeftPropSvg(leftPropType, darkMode),
        colors
          ? generatePropSvg(
              rightPropType,
              colors.right,
              darkMode === undefined ? undefined : darkMode ? "dark" : "light"
            )
          : generateRightPropSvg(rightPropType, darkMode),
      ]);

      // Create new images
      const [newLeftImage, newRightImage] = await Promise.all([
        this.createPropImageFromSVG(
          leftPropData.svg,
          leftPropData.width,
          leftPropData.height
        ),
        this.createPropImageFromSVG(
          rightPropData.svg,
          rightPropData.width,
          rightPropData.height
        ),
      ]);

      if (this.primaryColorRequest !== request) {
        return { left: newLeftImage, right: newRightImage };
      }
      // Capture the outgoing sprites before replacing any of their geometry.
      // The renderer draws these snapshots at their own intrinsic bounds while
      // the incoming sprites draw at the new bounds below.
      this.previousLeftProp =
        this.leftPropImage && this.leftPropType
          ? {
              image: this.leftPropImage,
              dimensions: { ...this.leftPropDimensions },
              propType: this.leftPropType,
            }
          : null;
      this.previousRightProp =
        this.rightPropImage && this.rightPropType
          ? {
              image: this.rightPropImage,
              dimensions: { ...this.rightPropDimensions },
              propType: this.rightPropType,
            }
          : null;

      // Store incoming geometry and type.
      this.leftPropDimensions = {
        width: leftPropData.width,
        height: leftPropData.height,
      };
      this.rightPropDimensions = {
        width: rightPropData.width,
        height: rightPropData.height,
      };
      this.leftPropType = leftPropType;
      this.rightPropType = rightPropType;

      // Swap references
      this.leftPropImage = newLeftImage;
      this.rightPropImage = newRightImage;

      return {
        left: this.leftPropImage,
        right: this.rightPropImage,
      };
    } catch (error) {
      console.error(
        "[Canvas2DImageLoader] Failed to load per-color prop images:",
        error
      );
      throw error;
    }
  }

  async loadAdditionalLayerPropImages(
    layerIndex: number,
    leftPropType: string,
    rightPropType: string,
    leftColor: string,
    rightColor: string
  ): Promise<{
    left: HTMLImageElement;
    right: HTMLImageElement;
  }> {
    const request = Symbol();
    this.layerColorRequests.set(layerIndex, request);
    try {
      // Generate per-hand prop SVGs with custom colors for this layer. Blue and
      // red can be different prop types (each performer's per-hand prop).
      const [leftPropData, rightPropData] = await Promise.all([
        generatePropSvg(leftPropType, leftColor),
        generatePropSvg(rightPropType, rightColor),
      ]);

      // Create new images
      const [newLeftImage, newRightImage] = await Promise.all([
        this.createPropImageFromSVG(
          leftPropData.svg,
          leftPropData.width,
          leftPropData.height
        ),
        this.createPropImageFromSVG(
          rightPropData.svg,
          rightPropData.width,
          rightPropData.height
        ),
      ]);

      // A quick hue drag can finish decoding an old shade after the new one.
      if (this.layerColorRequests.get(layerIndex) !== request) {
        return { left: newLeftImage, right: newRightImage };
      }
      // Ensure arrays are large enough (images + dimensions stay index-aligned)
      while (this.additionalLayerImages.length <= layerIndex) {
        this.additionalLayerImages.push({ left: null, right: null });
      }
      while (this.additionalLayerDimensions.length <= layerIndex) {
        this.additionalLayerDimensions.push({
          left: { width: 0, height: 0 },
          right: { width: 0, height: 0 },
        });
      }

      // Swap references
      this.additionalLayerImages[layerIndex] = {
        left: newLeftImage,
        right: newRightImage,
      };
      this.additionalLayerDimensions[layerIndex] = {
        left: { width: leftPropData.width, height: leftPropData.height },
        right: { width: rightPropData.width, height: rightPropData.height },
      };

      return { left: newLeftImage, right: newRightImage };
    } catch (error) {
      console.error(
        `[Canvas2DImageLoader] Failed to load additional layer ${layerIndex} prop images:`,
        error
      );
      throw error;
    }
  }

  async loadGridImage(
    gridMode: string,
    canvasSize: number,
    showNonRadialPoints: boolean = true
  ): Promise<HTMLImageElement> {
    // The grid is the one image reloaded on every resize, and it is also the
    // most expensive: a dynamic import, an SVG build, a base64 encode, and a
    // full image decode. None of that changes with the canvas size — only the
    // decoded raster does — so both halves are cached, and a container that
    // returns to a size it has already drawn at pays nothing at all.
    const spriteKey = `${gridMode}|${showNonRadialPoints}|${canvasSize}`;
    const cachedSprite = GRID_SPRITE_CACHE.get(spriteKey);
    if (cachedSprite) {
      this.gridImage = cachedSprite;
      return cachedSprite;
    }

    try {
      const { GridMode } =
        await import("$lib/shared/pictograph/grid/domain/enums/grid-enums");

      // Convert gridMode string to GridMode enum
      // "8point" needs special handling since "8POINT" isn't a valid enum key
      let gridModeEnum: (typeof GridMode)[keyof typeof GridMode];
      if (gridMode === "8point") {
        gridModeEnum = GridMode.EIGHT_POINT;
      } else {
        gridModeEnum =
          GridMode[gridMode.toUpperCase() as keyof typeof GridMode] ||
          GridMode.DIAMOND;
      }

      const svgKey = `${gridMode}|${showNonRadialPoints}`;
      let gridSvg = GRID_SVG_CACHE.get(svgKey);
      if (gridSvg === undefined) {
        gridSvg = await generateGridSvg(
          gridModeEnum,
          true,
          showNonRadialPoints
        );
        GRID_SVG_CACHE.set(svgKey, gridSvg);
      }

      // Create new image
      const newImage = await this.createImageFromSVG(
        gridSvg,
        canvasSize,
        canvasSize
      );

      rememberGridSprite(spriteKey, newImage);

      // Swap reference
      this.gridImage = newImage;

      return this.gridImage;
    } catch (error) {
      console.error("[Canvas2DImageLoader] Failed to load grid image:", error);
      throw error;
    }
  }

  async loadGlyphImage(
    svgString: string,
    _width: number,
    _height: number
  ): Promise<{
    current: HTMLImageElement;
    previous: HTMLImageElement | null;
  }> {
    try {
      // CRITICAL: Clear old previousGlyphImage reference
      // HTMLImageElements don't need explicit destroy, but clearing ref allows GC
      this.previousGlyphImage = null;

      // Save previous glyph for fade transition
      if (this.glyphImage) {
        this.previousGlyphImage = this.glyphImage;
      }

      // Create image from SVG (full 950x950 viewBox)
      this.glyphImage = await this.createImageFromSVG(
        svgString,
        VIEWBOX_SIZE,
        VIEWBOX_SIZE
      );

      return {
        current: this.glyphImage,
        previous: this.previousGlyphImage,
      };
    } catch (error) {
      console.error("[Canvas2DImageLoader] Failed to load glyph image:", error);
      throw error;
    }
  }

  /**
   * Decode a prop sprite once across every animation engine on the page.
   *
   * Shape changes replace the sequence but normally keep the same prop. The
   * generic SVG cache owns decoded-image reuse and also coalesces concurrent
   * loads, so the incoming and outgoing players never ask Chrome to decode the
   * same data-URI image again during a crossfade.
   */
  private async createPropImageFromSVG(
    svgString: string,
    width: number,
    height: number
  ): Promise<HTMLImageElement> {
    const cacheKey = `animation-prop:${width}x${height}:${hashString(svgString)}`;
    const image = await getSvgImageCache().getImage(svgString, cacheKey);

    // Canvas2DAnimationRenderer runs on the browser main thread, where the
    // shared cache deliberately returns HTMLImageElement for reliable SVG
    // decoding. Width and height match the prop SVG's intrinsic viewBox.
    const propImage = image as HTMLImageElement;
    propImage.width = width;
    propImage.height = height;
    return propImage;
  }

  /**
   * Convert SVG string to HTMLImageElement
   * Uses data URL approach for reliable cross-browser support
   */
  private async createImageFromSVG(
    svgString: string,
    width: number,
    height: number
  ): Promise<HTMLImageElement> {
    // Convert SVG to data URL
    const base64 = btoa(unescape(encodeURIComponent(svgString)));
    const dataUrl = `data:image/svg+xml;base64,${base64}`;

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.width = width;
      img.height = height;

      img.onload = () => {
        // Clean up handlers
        img.onload = null;
        img.onerror = null;
        resolve(img);
      };

      img.onerror = () => {
        // Clean up handlers
        img.onload = null;
        img.onerror = null;
        console.error("[Canvas2DImageLoader] Image load error");
        reject(new Error("Failed to load SVG image"));
      };

      img.src = dataUrl;
    });
  }

  // Getters
  getLeftPropImage(): HTMLImageElement | null {
    return this.leftPropImage;
  }

  getRightPropImage(): HTMLImageElement | null {
    return this.rightPropImage;
  }

  getLeftPropType(): string | null {
    return this.leftPropType;
  }

  getRightPropType(): string | null {
    return this.rightPropType;
  }

  getPreviousLeftProp(): PropSpriteSnapshot | null {
    return this.previousLeftProp;
  }

  getPreviousRightProp(): PropSpriteSnapshot | null {
    return this.previousRightProp;
  }

  getAdditionalLayerImages(layerIndex: number): {
    left: HTMLImageElement | null;
    right: HTMLImageElement | null;
  } {
    if (layerIndex < this.additionalLayerImages.length) {
      return this.additionalLayerImages[layerIndex]!;
    }
    return { left: null, right: null };
  }

  /** Intrinsic per-hand dimensions of an additional layer's props, or null when
   *  that layer hasn't loaded yet (caller falls back to the base dimensions). */
  getAdditionalLayerDimensions(layerIndex: number): {
    left: { width: number; height: number };
    right: { width: number; height: number };
  } | null {
    return this.additionalLayerDimensions[layerIndex] ?? null;
  }

  getGridImage(): HTMLImageElement | null {
    return this.gridImage;
  }

  getGlyphImage(): HTMLImageElement | null {
    return this.glyphImage;
  }

  getPreviousGlyphImage(): HTMLImageElement | null {
    return this.previousGlyphImage;
  }

  getLeftPropDimensions(): { width: number; height: number } {
    return this.leftPropDimensions;
  }

  getRightPropDimensions(): { width: number; height: number } {
    return this.rightPropDimensions;
  }

  clearPreviousGlyphImage(): void {
    this.previousGlyphImage = null;
  }

  clearPreviousLeftProp(): void {
    this.previousLeftProp = null;
  }

  clearPreviousRightProp(): void {
    this.previousRightProp = null;
  }

  destroy(): void {
    // Clear all image references (allows garbage collection)
    this.leftPropImage = null;
    this.rightPropImage = null;
    this.previousLeftProp = null;
    this.previousRightProp = null;
    this.leftPropType = null;
    this.rightPropType = null;
    this.additionalLayerImages.length = 0;
    this.layerColorRequests.clear();
    this.primaryColorRequest = null;
    this.additionalLayerDimensions.length = 0;
    this.gridImage = null;
    this.glyphImage = null;
    this.previousGlyphImage = null;
  }
}
