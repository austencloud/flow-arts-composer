/**
 * Prop SVG Loader Service - OPTIMIZED (2025 Best Practices)
 *
 * Fast, direct SVG loading for props with aggressive caching.
 *
 * Key optimizations:
 * - Multi-level caching (raw SVG + transformed SVG by color)
 * - Request deduplication (prevents duplicate concurrent fetches)
 * - Cached metadata parsing (viewBox, center)
 * - Performance monitoring (cache hit/miss tracking)
 * - HMR-aware cache persistence (prevents mass refetches on code changes)
 */

import type { MotionData } from "../../shared/domain/models/motion-data";
import type { PropPlacementData } from "../domain/models/prop-placement-data";
import type { PropRenderData } from "../domain/models/prop-render-data";
import type { PropSvgLoadOptions } from "./types";
import { HandSide } from "../../shared/domain/enums/pictograph-enums";
import {
  applyMotionColorToSvg,
  SELECTIVE_COLOR_PROP_TYPES,
  type ThemeMode,
} from "../../../utils/svg-color-utils";
import { applyTorchContrastPalette } from "../domain/torch-contrast";
import {
  applyFanFrameColor,
  applyFanPaperContrast,
  fanAppearanceArtwork,
  isFanPropType,
  normalizeFanAppearance,
  scaleFanAppearanceForBigFan,
} from "../domain/fan-appearance";
import { getMotionColor } from "../../../utils/svg-color-utils";
import { getAnimationVisibilityManager } from "../../../animation-engine/state/animation-visibility-state.svelte";
import { assetFetch } from "../../../net/asset-fetch";

// Persist caches across HMR to prevent mass network requests during development.
// Without this, every code change would trigger many SVG refetches.

const hmrRawSvgCache: Map<string, string> =
  import.meta.hot?.data?.propRawSvgCache ?? new Map();
const hmrTransformedSvgCache: Map<string, PropRenderData> =
  import.meta.hot?.data?.propTransformedSvgCache ?? new Map();
const hmrMetadataCache: Map<
  string,
  {
    viewBox: { width: number; height: number };
    center: { x: number; y: number };
  }
> = import.meta.hot?.data?.propMetadataCache ?? new Map();

if (import.meta.hot) {
  import.meta.hot.dispose((data) => {
    data.propRawSvgCache = hmrRawSvgCache;
    data.propTransformedSvgCache = hmrTransformedSvgCache;
    data.propMetadataCache = hmrMetadataCache;
  });
}

export class PropSvgLoader {
  // 🚀 OPTIMIZATION: Use HMR-aware module-level caches
  private rawSvgCache = hmrRawSvgCache; // path -> raw SVG text
  private transformedSvgCache = hmrTransformedSvgCache; // path:color:themeMode -> transformed data
  private loadingPromises = new Map<string, Promise<string>>(); // path -> loading promise (not persisted)
  private metadataCache = hmrMetadataCache;

  // Performance monitoring
  private cacheHits = 0;
  private cacheMisses = 0;
  /**
   * Get the current theme mode based on dark mode setting
   * Dark mode (Dark Mode) = "dark" theme, Light mode = "light" theme
   */
  private getCurrentThemeMode(): ThemeMode {
    try {
      const manager = getAnimationVisibilityManager();
      return manager.isDarkMode() ? "dark" : "light";
    } catch {
      // Fallback to light mode if manager not available
      return "light";
    }
  }

  /**
   * Load prop SVG data with color transformation
   * 🚀 OPTIMIZED: Checks transformed cache first, then raw cache, then fetches
   * @param propData - Prop placement data
   * @param motionData - Motion data including prop type
   * @param useGridVersion - If true, loads grid-centered SVGs from props/animated/ (for animation canvas).
   *   If false (default), loads from props/pictograph/ which are sized for pictograph rendering.
   * @param options - Optional settings including themeMode for color selection
   */
  async loadPropSvg(
    propData: PropPlacementData,
    motionData: MotionData,
    useGridVersion: boolean = false,
    options?: PropSvgLoadOptions
  ): Promise<PropRenderData> {
    try {
      // Get prop type and color
      const propType = motionData.propType || "staff";
      const color = motionData.hand || HandSide.LEFT;

      // Use explicit theme mode if provided, otherwise fall back to global state
      const themeMode = options?.themeMode ?? this.getCurrentThemeMode();

      // A fan-family prop draws the physical build the user picked (the same
      // artwork the animator and 3D scene show). The appearance files share
      // the pictograph fan's 260x207 box, so placement rules stay intact.
      const fanAppearance =
        options?.fanAppearance && isFanPropType(propType)
          ? normalizeFanAppearance(options.fanAppearance)
          : null;
      const fanArtworkPath =
        fanAppearance && fanAppearance.build !== "pictograph"
          ? fanAppearanceArtwork(fanAppearance.build, fanAppearance.cover)
          : null;

      // Create cache key including color AND theme mode for transformed prop cache
      // Two prop SVG folders:
      //   /images/props/animated/    → animation canvas (wider viewBox for rotation)
      //   /images/props/pictograph/  → pictograph grid rendering
      const path =
        fanArtworkPath ??
        (useGridVersion
          ? `/images/props/animated/${propType}.svg`
          : `/images/props/pictograph/${propType}.svg`);
      // The prop type is part of the key because fan and bigfan share one
      // appearance file and differ only in the sizing applied below.
      const transformedCacheKey = `${path}:${propType}:${color}:${themeMode}`;

      // 🚀 OPTIMIZATION: Check transformed cache first (fastest path)
      if (this.transformedSvgCache.has(transformedCacheKey)) {
        this.cacheHits++;
        const cached = this.transformedSvgCache.get(transformedCacheKey)!;
        // Return with updated position/rotation (these are per-instance)
        return {
          ...cached,
          position: { x: propData.positionX, y: propData.positionY },
          rotation: propData.rotationAngle,
        };
      }

      // Fetch raw SVG (uses raw cache + deduplication)
      const originalSvgText = await this.fetchSvgContentCached(path);

      // A batch can share the fetch while every caller misses the first cache
      // check. Reuse the first completed transform, retaining this card's pose.
      const preparedWhileFetching =
        this.transformedSvgCache.get(transformedCacheKey);
      if (preparedWhileFetching) {
        this.cacheHits++;
        return {
          ...preparedWhileFetching,
          position: { x: propData.positionX, y: propData.positionY },
          rotation: propData.rotationAngle,
        };
      }
      this.cacheMisses++;

      // Apply color transformation with current theme mode. Physical fan
      // builds own their material colors, so only the marked frame group
      // takes the hand color; the generic recolor would paint the wicks too.
      // Those materials were tuned on a dark pictograph; a light one (the
      // choreo sheet, its PDF) gets the paper palette so the fan still reads.
      const coloredSvgText = fanArtworkPath
        ? applyFanPaperContrast(
            applyFanFrameColor(
              originalSvgText,
              getMotionColor(color, themeMode)
            ),
            themeMode
          )
        : this.applyColorToSvg(originalSvgText, color, themeMode, propType);
      const sizedSvgText =
        fanArtworkPath && propType.toLowerCase() === "bigfan"
          ? scaleFanAppearanceForBigFan(coloredSvgText)
          : coloredSvgText;

      // Torch artwork is a near-black shaft with no flame, so it disappears on
      // a dark pictograph. Baking the contrast palette in here means every
      // consumer of this loader inherits it — the live DOM, the worker raster
      // behind choreo cards, image export and print. The animated artwork
      // carries its own flame and is handled by the animation svg-generator.
      const contrastAdjustedSvgText = useGridVersion
        ? sizedSvgText
        : applyTorchContrastPalette(sizedSvgText, propType, themeMode);

      // Parse viewBox and center from the artwork that actually ships. The
      // torch treatment grows the box around the flame, and Big Fan sizing
      // swaps the box entirely; the shared path-keyed metadata cache would
      // hand back the pre-treatment box.
      const treated = contrastAdjustedSvgText !== coloredSvgText;
      const { viewBox, center } = treated
        ? this.parsePropSvg(contrastAdjustedSvgText)
        : this.parsePropSvgCached(originalSvgText, path);

      // Extract SVG content
      const svgContent = this.extractSvgContent(contrastAdjustedSvgText);

      const result: PropRenderData = {
        position: { x: propData.positionX, y: propData.positionY },
        rotation: propData.rotationAngle,
        svgData: {
          svgContent,
          viewBox,
          center,
        },
        loaded: true,
        error: null,
      };

      // 🚀 OPTIMIZATION: Cache transformed result
      this.transformedSvgCache.set(transformedCacheKey, result);

      return result;
    } catch (error) {
      console.error("❌ PropSvgLoader: Error loading prop SVG:", error);
      return {
        position: { x: 475, y: 475 },
        rotation: 0,
        svgData: null,
        loaded: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * 🚀 NEW: Fetch SVG content with caching and deduplication
   */
  private async fetchSvgContentCached(path: string): Promise<string> {
    // Check raw SVG cache
    if (this.rawSvgCache.has(path)) {
      return this.rawSvgCache.get(path)!;
    }

    // Check if already loading (prevents duplicate concurrent requests)
    if (this.loadingPromises.has(path)) {
      return this.loadingPromises.get(path)!;
    }

    // Create loading promise
    const loadingPromise = this.fetchSvgContent(path);
    this.loadingPromises.set(path, loadingPromise);

    try {
      const svgText = await loadingPromise;

      // Cache the raw SVG
      this.rawSvgCache.set(path, svgText);

      // Clean up loading promise
      this.loadingPromises.delete(path);

      return svgText;
    } catch (error) {
      // Clean up on error
      this.loadingPromises.delete(path);
      throw error;
    }
  }

  /**
   * Fetch SVG content from a given path - direct fetch
   */
  async fetchSvgContent(path: string): Promise<string> {
    const response = await assetFetch(path);
    if (!response.ok) {
      throw new Error(`Failed to fetch SVG: ${response.status}`);
    }
    return await response.text();
  }

  /**
   * 🚀 NEW: Parse prop SVG with caching
   */
  private parsePropSvgCached(
    svgText: string,
    cacheKey: string
  ): {
    viewBox: { width: number; height: number };
    center: { x: number; y: number };
  } {
    // Check metadata cache
    if (this.metadataCache.has(cacheKey)) {
      return this.metadataCache.get(cacheKey)!;
    }

    // Parse and cache
    const result = this.parsePropSvg(svgText);
    this.metadataCache.set(cacheKey, result);
    return result;
  }

  /**
   * Parse prop SVG to extract viewBox and center
   */
  private parsePropSvg(svgText: string): {
    viewBox: { width: number; height: number };
    center: { x: number; y: number };
  } {
    // Regex parse (no DOMParser): the composition worker has no DOM, and
    // DOMParser is undefined there. Reads the same `viewBox` attribute.
    const viewBoxMatch = svgText.match(
      /<svg\b[^>]*\bviewBox\s*=\s*["']([^"']+)["']/i
    );
    if (!svgText.match(/<svg\b/i)) {
      throw new Error("Invalid SVG: No SVG element found");
    }

    let width = 100,
      height = 100;

    if (viewBoxMatch) {
      const [, , w, h] = viewBoxMatch[1]!.trim().split(/\s+/).map(Number);
      width = w || 100;
      height = h || 100;
    }

    return {
      viewBox: { width, height },
      center: { x: width / 2, y: height / 2 },
    };
  }

  /**
   * Apply color transformation to SVG
   * Delegates to shared svg-color-utils for consistency across the app.
   * Torch-family props preserve dark body fills (only knob/handle gets colored).
   */
  private applyColorToSvg(
    svgText: string,
    color: HandSide,
    themeMode: ThemeMode,
    propType?: string
  ): string {
    const isSelective = propType
      ? (SELECTIVE_COLOR_PROP_TYPES as readonly string[]).includes(
          propType.toLowerCase()
        )
      : false;

    return applyMotionColorToSvg(svgText, color, {
      makeClassNamesUnique: true,
      themeMode,
      selectiveColorMode: isSelective,
    });
  }

  /**
   * Extract SVG content (remove outer SVG wrapper)
   */
  private extractSvgContent(svgText: string): string {
    // Regex parse (no DOMParser): worker-safe. Returns the inner markup between
    // the outer <svg> tags (equivalent to svgElement.innerHTML for these props).
    const match = svgText.match(/<svg\b[^>]*>([\s\S]*)<\/svg\s*>/i);
    return match ? match[1]! : svgText;
  }

  /**
   * 🚀 NEW: Clear caches (useful for testing or memory management)
   */
  clearCache(): void {
    this.rawSvgCache.clear();
    this.transformedSvgCache.clear();
    this.loadingPromises.clear();
    this.metadataCache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  /**
   * 🚀 NEW: Get cache statistics for performance monitoring
   */
  getCacheStats() {
    return {
      rawCacheSize: this.rawSvgCache.size,
      transformedCacheSize: this.transformedSvgCache.size,
      metadataCacheSize: this.metadataCache.size,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      hitRate:
        this.cacheHits + this.cacheMisses > 0
          ? (
              (this.cacheHits / (this.cacheHits + this.cacheMisses)) *
              100
            ).toFixed(2) + "%"
          : "0%",
    };
  }
}

// ============================================================================
// DIRECT SINGLETON EXPORT
// ============================================================================
// Use this instead of propSvgLoader to avoid DI container rebuilds.
// PropSvgLoader has no constructor dependencies.
// ============================================================================

// HMR-aware singleton instance
let hmrPropSvgLoader: PropSvgLoader | null =
  import.meta.hot?.data?.propSvgLoaderInstance ?? null;

if (import.meta.hot) {
  import.meta.hot.dispose((data) => {
    data.propSvgLoaderInstance = hmrPropSvgLoader;
  });
}

function getPropSvgLoader(): PropSvgLoader {
  if (!hmrPropSvgLoader) {
    hmrPropSvgLoader = new PropSvgLoader();
  }
  return hmrPropSvgLoader;
}

export const propSvgLoader = getPropSvgLoader();
