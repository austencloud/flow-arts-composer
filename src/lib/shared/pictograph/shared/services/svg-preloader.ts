/**
 * SVG Preload Service Implementation
 *
 * Preloads and caches SVG assets to eliminate loading delays in pictographs.
 * Uses aggressive caching and parallel loading for optimal performance.
 */

interface PreloadProgress {
  loaded: number;
  total: number;
}

export class SvgPreloader {
  private svgCache = new Map<string, string>();
  private loadingPromises = new Map<string, Promise<string>>();
  private progress: PreloadProgress = { loaded: 0, total: 0 };

  // Essential SVGs that should be preloaded immediately
  // Based on PropTypeTab.svelte - all commonly used props
  private readonly ESSENTIAL_PROPS = [
    "staff",
    "simple_staff",
    "club",
    "classic_club",
    "fan",
    "triad",
    "minihoop",
    "triangle",
    "buugeng",
    "triquetra",
    "sword",
    "hand",
    "guitar",
    "ukulele",
    // Note: Excluding 'chicken' as it's a PNG and very large
  ];

  private readonly GRID_TYPES = ["diamond_grid", "box_grid", "skewed_grid"];

  // Note: Arrow preloading disabled - arrows use separate loading system via ArrowPathResolutionService
  // The arrow system loads SVGs dynamically based on motion data, not via preload service

  /**
   * Preload all essential SVGs for immediate use
   */
  async preloadEssentialSvgs(): Promise<void> {
    // Calculate total items to load
    this.progress.total = this.ESSENTIAL_PROPS.length + this.GRID_TYPES.length;
    this.progress.loaded = 0;

    // Load grids and essential props in parallel
    const gridPromises = this.preloadGridSvgs();
    const propPromises = this.preloadPropSvgs(this.ESSENTIAL_PROPS);
    // Note: Arrow preloading disabled - arrows use separate loading system

    await Promise.all([gridPromises, propPromises]);
  }

  /**
   * Preload specific prop SVGs
   */
  async preloadPropSvgs(propTypes: string[]): Promise<void> {
    const promises = propTypes.map((propType) =>
      this.loadSvg("prop", propType)
    );
    await Promise.all(promises);
  }

  /**
   * Preload all grid SVGs
   */
  async preloadGridSvgs(): Promise<void> {
    const promises = this.GRID_TYPES.map((gridType) =>
      this.loadSvg("grid", gridType)
    );
    await Promise.all(promises);
  }

  /**
   * Arrow preloading disabled - arrows use separate loading system
   * @deprecated Arrows are loaded via ArrowPathResolutionService based on motion data
   */
  async preloadArrowSvgs(): Promise<void> {
    // No-op - arrows use separate loading system
    return Promise.resolve();
  }

  /**
   * Get SVG content (returns immediately if cached)
   */
  async getSvgContent(
    type: "prop" | "grid" | "arrow",
    name: string
  ): Promise<string> {
    const cacheKey = `${type}:${name}`;

    // Return cached content immediately
    if (this.svgCache.has(cacheKey)) {
      return this.svgCache.get(cacheKey)!;
    }

    // Return existing loading promise if already loading
    if (this.loadingPromises.has(cacheKey)) {
      return this.loadingPromises.get(cacheKey)!;
    }

    // Load on-demand if not cached
    return this.loadSvg(type, name);
  }

  /**
   * Check if SVG is cached
   */
  isCached(type: "prop" | "grid" | "arrow", name: string): boolean {
    const cacheKey = `${type}:${name}`;
    return this.svgCache.has(cacheKey);
  }

  /**
   * Get preload progress
   */
  getPreloadProgress(): { loaded: number; total: number; percentage: number } {
    const percentage =
      this.progress.total > 0
        ? (this.progress.loaded / this.progress.total) * 100
        : 0;
    return {
      ...this.progress,
      percentage: Math.round(percentage),
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.svgCache.clear();
    this.loadingPromises.clear();
    this.progress = { loaded: 0, total: 0 };
  }

  /**
   * Load and cache a single SVG
   */
  private async loadSvg(
    type: "prop" | "grid" | "arrow",
    name: string
  ): Promise<string> {
    const cacheKey = `${type}:${name}`;

    // Return cached if available
    if (this.svgCache.has(cacheKey)) {
      return this.svgCache.get(cacheKey)!;
    }

    // Return existing promise if already loading
    if (this.loadingPromises.has(cacheKey)) {
      return this.loadingPromises.get(cacheKey)!;
    }

    // Create loading promise
    const loadingPromise = this.fetchSvg(type, name);
    this.loadingPromises.set(cacheKey, loadingPromise);

    try {
      const svgContent = await loadingPromise;

      // Cache the result
      this.svgCache.set(cacheKey, svgContent);
      this.progress.loaded++;

      // Clean up loading promise
      this.loadingPromises.delete(cacheKey);

      return svgContent;
    } catch (error) {
      // Clean up failed loading promise
      this.loadingPromises.delete(cacheKey);
      throw error;
    }
  }

  /**
   * Fetch SVG from server
   */
  private async fetchSvg(
    type: "prop" | "grid" | "arrow",
    name: string
  ): Promise<string> {
    let url: string;

    if (type === "prop") {
      url = `/images/props/pictograph/${name}.svg`;
    } else if (type === "grid") {
      url = `/images/grid/${name}.svg`;
    } else {
      // arrow
      // Handle arrow paths which can be either simple (dash, float) or complex (static/from_radial/static_0.0)
      url = name.includes("/")
        ? `/images/arrows/${name}.svg`
        : `/images/arrows/${name}.svg`;
    }

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Failed to load ${type} SVG: ${name} (${response.status})`
      );
    }

    return response.text();
  }
}

// Direct singleton export for HMR-friendly imports
export const svgPreloader = new SvgPreloader();
