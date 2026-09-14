/**
 * SVG Loading Service - OPTIMIZED (2025 Best Practices)
 *
 * Handles fetching and loading SVG files with aggressive caching.
 *
 * Key optimizations:
 * - Multi-level caching (raw SVG + transformed SVG by color AND theme mode)
 * - Request deduplication (prevents duplicate concurrent fetches)
 * - Performance monitoring (cache hit/miss tracking)
 * - HMR-aware cache persistence (prevents mass refetches on code changes)
 *
 * Theme mode can be passed explicitly (for exports) or defaults to
 * reading from AnimationVisibilityStateManager (for live display).
 *
 * Extracted from ArrowRenderer to improve modularity and reusability.
 */

// Type imports removed — value imports at bottom of file provide both type and value
import type { ArrowPlacementData } from "../../positioning/placement/domain/arrow-placement-data";
import type { ArrowSvgData } from "../../../shared/domain/models/svg-models";
import type { ArrowSvgLoadOptions } from "./types";
import type { MotionData } from "../../../shared/domain/models/motion-data";
import type { ThemeMode } from "../../../../utils/svg-color-utils";
import { getAnimationVisibilityManager } from "../../../../animation-engine/state/animation-visibility-state.svelte";
import { getArrowPath } from "./arrow-path-resolver";
import { parseArrowSvg, extractSvgContent } from "./arrow-svg-parser";
import { applyColorToSvg } from "./arrow-svg-color-transformer";

// These module-level caches persist across HMR to prevent mass network requests
// when code changes trigger module reloads. The ArrowSvgLoader singleton
// uses these shared caches instead of instance properties.
//
// Without HMR persistence, every arrow on screen would refetch its SVG
// after any file change, causing 1000+ network requests and 20+ second delays.

const hmrRawSvgCache: Map<string, string> =
  import.meta.hot?.data?.rawSvgCache ?? new Map();
const hmrTransformedSvgCache: Map<string, ArrowSvgData> =
  import.meta.hot?.data?.transformedSvgCache ?? new Map();

// Arrow split manifest - loaded lazily, cached permanently
let hmrSplitManifest: Record<
  string,
  {
    shaftPath: string;
    tipPath: string;
    tipBBox: { x: number; y: number; width: number; height: number };
  }
> | null = import.meta.hot?.data?.splitManifest ?? null;
let manifestLoadPromise: Promise<void> | null = null;

// Persist caches before HMR disposal
if (import.meta.hot) {
  import.meta.hot.dispose((data) => {
    data.rawSvgCache = hmrRawSvgCache;
    data.transformedSvgCache = hmrTransformedSvgCache;
    data.splitManifest = hmrSplitManifest;
    data.arrowSvgLoaderInstance = hmrArrowSvgLoader;
  });
}

async function loadSplitManifest(): Promise<void> {
  if (hmrSplitManifest !== null) return;
  if (manifestLoadPromise) return manifestLoadPromise;

  manifestLoadPromise = (async () => {
    try {
      const response = await fetch("/images/arrows/arrow-split-manifest.json");
      if (response.ok) {
        hmrSplitManifest = await response.json();
      } else {
        hmrSplitManifest = {};
      }
    } catch {
      hmrSplitManifest = {};
    }
  })();

  return manifestLoadPromise;
}

export class ArrowSvgLoader {
  // 🚀 OPTIMIZATION: Use HMR-aware module-level caches
  private rawSvgCache = hmrRawSvgCache; // path -> raw SVG text
  private transformedSvgCache = hmrTransformedSvgCache; // path:color:themeMode -> transformed data
  private loadingPromises = new Map<string, Promise<string>>(); // path -> loading promise (not persisted)

  // Performance monitoring
  private cacheHits = 0;
  private cacheMisses = 0;

  constructor() {}

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
   * Load arrow SVG data with color transformation based on placement data (extracted from Arrow.svelte)
   * 🚀 OPTIMIZED: Checks transformed cache first, then raw cache, then fetches
   * @param options Optional settings including themeMode for color selection
   */
  async loadArrowSvg(
    arrowData: ArrowPlacementData,
    motionData: MotionData,
    options?: ArrowSvgLoadOptions
  ): Promise<ArrowSvgData> {
    const path = getArrowPath(arrowData, motionData);

    if (!path) {
      console.error(
        "❌ ArrowSvgLoader: No arrow path available - missing motion data"
      );
      throw new Error("No arrow path available - missing motion data");
    }

    // Use explicit theme mode if provided, otherwise fall back to global state
    const themeMode = options?.themeMode ?? this.getCurrentThemeMode();

    const transformedCacheKey = `${path}:${motionData.hand}:${themeMode}`;

    // 🚀 OPTIMIZATION: Check transformed cache first (fastest path)
    if (this.transformedSvgCache.has(transformedCacheKey)) {
      this.cacheHits++;
      return this.transformedSvgCache.get(transformedCacheKey)!;
    }

    // Both resources are independent. Once they arrive, transform without
    // another await so concurrent cards can reuse the first completed result.
    const [originalSvgText] = await Promise.all([
      this.fetchSvgContentCached(path),
      loadSplitManifest(),
    ]);
    const preparedWhileFetching =
      this.transformedSvgCache.get(transformedCacheKey);
    if (preparedWhileFetching) {
      this.cacheHits++;
      return preparedWhileFetching;
    }
    this.cacheMisses++;

    const parsedSvg = parseArrowSvg(originalSvgText);

    // Apply color transformation to the SVG, passing theme mode
    const coloredSvgText = applyColorToSvg(
      originalSvgText,
      motionData.hand,
      themeMode
    );

    // Extract just the inner SVG content (no scaling needed - arrows are already correctly sized)
    const svgContent = extractSvgContent(coloredSvgText);

    const result: ArrowSvgData = {
      id: `arrow-${Date.now()}`,
      svgContent: svgContent,
      imageSrc: svgContent,
      viewBox: parsedSvg.viewBox || "100 100",
      center: parsedSvg.center ?? undefined,
      dimensions: {
        width: parsedSvg.width || 100,
        height: parsedSvg.height || 100,
        viewBox: parsedSvg.viewBox || "100 100",
        center: parsedSvg.center ?? undefined,
      },
    };

    // Look up split data from manifest
    if (hmrSplitManifest) {
      // Strip base path to get relative key (e.g. "pro/from_radial/pro_0.0.svg")
      const manifestKey = path.replace(/^.*\/images\/arrows\//, "");
      const splitData = hmrSplitManifest[manifestKey];
      if (splitData) {
        // Apply color transformation to split paths too
        result.shaftSrc = applyColorToSvg(
          splitData.shaftPath,
          motionData.hand,
          themeMode
        );
        result.tipSrc = applyColorToSvg(
          splitData.tipPath,
          motionData.hand,
          themeMode
        );
        result.tipBBox = splitData.tipBBox;
      }
    }

    // 🚀 OPTIMIZATION: Cache transformed result
    this.transformedSvgCache.set(transformedCacheKey, result);

    return result;
  }

  /**
   * 🚀 NEW: Fetch SVG content with caching and deduplication
   * This method checks the raw cache first, then deduplicates concurrent requests
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
   * Fetch SVG content from a given path
   * Note: Public for interface compliance, but internal code should use fetchSvgContentCached
   */
  async fetchSvgContent(path: string): Promise<string> {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to fetch SVG: ${response.status}`);
    }
    return await response.text();
  }

  /**
   * 🚀 NEW: Clear caches (useful for testing or memory management)
   */
  clearCache(): void {
    this.rawSvgCache.clear();
    this.transformedSvgCache.clear();
    this.loadingPromises.clear();
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
// Use this instead of arrowSvgLoader to avoid DI container rebuilds.
// Dependencies are created inline since they're all stateless.
// ============================================================================

// HMR-aware singleton instance
let hmrArrowSvgLoader: ArrowSvgLoader | null =
  import.meta.hot?.data?.arrowSvgLoaderInstance ?? null;

function getArrowSvgLoader(): ArrowSvgLoader {
  if (!hmrArrowSvgLoader) {
    hmrArrowSvgLoader = new ArrowSvgLoader();
  }
  return hmrArrowSvgLoader;
}

export const arrowSvgLoader = getArrowSvgLoader();
