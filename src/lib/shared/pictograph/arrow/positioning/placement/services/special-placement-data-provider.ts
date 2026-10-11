/**
 * Special Placement Data Provider
 *
 * Handles loading and caching of special placement JSON data.
 * Uses Promise-based caching to prevent race conditions during concurrent loads.
 */

import { jsonCache } from "#lib/shared/pictograph/shared/services/simple-json-cache.js";
import type { SimpleJsonCache } from "#lib/shared/pictograph/shared/services/simple-json-cache.js";
import {
  placementAssetRoot,
  placementFrameForGridMode,
  type PlacementFrame,
} from "../domain/placement-frame";

export class SpecialPlacementDataProvider {
  // Structure: [placementFrame][oriKey][letter] -> Record<string, unknown>
  private cache: Record<
    string,
    Record<string, Record<string, Record<string, unknown>>>
  > = {
    canonical: {},
    skewed: {},
  };

  // Track in-flight loading operations to prevent race conditions
  private loadingPromises = new Map<string, Promise<void>>();

  // Manifest of which files actually exist, keyed by authored placement frame.
  private manifests = new Map<string, Record<string, string[]>>();
  private manifestLoadPromises = new Map<string, Promise<void>>();

  /**
   * Create SpecialPlacementDataProvider with injectable JSON cache
   * @param jsonCache JSON cache implementation (defaults to browser fetch-based cache)
   */
  constructor(private readonly jsonCacheImpl: SimpleJsonCache = jsonCache) {}

  /**
   * Load the manifest file that tells us which placement files exist
   */
  private async loadManifest(frame: PlacementFrame): Promise<void> {
    if (this.manifests.has(frame)) return;

    // Check if loading is already in progress for this gridMode
    if (this.manifestLoadPromises.has(frame)) {
      await this.manifestLoadPromises.get(frame);
      return;
    }

    const loadPromise = (async () => {
      try {
        const manifestPath = `${placementAssetRoot(frame)}/special/placement_manifest.json`;
        const manifest = (await this.jsonCacheImpl.get(manifestPath)) as Record<
          string,
          string[]
        >;
        this.manifests.set(frame, manifest);
      } finally {
        // Clean up loading promise
        this.manifestLoadPromises.delete(frame);
      }
    })();

    this.manifestLoadPromises.set(frame, loadPromise);
    await loadPromise;
  }

  /**
   * Check if a placement file exists for the given letter
   */
  private async hasPlacementFile(
    frame: PlacementFrame,
    oriKey: string,
    letter: string
  ): Promise<boolean> {
    await this.loadManifest(frame);
    const manifest = this.manifests.get(frame);
    return manifest?.[oriKey]?.includes(letter) ?? false;
  }

  /**
   * Get special placement data for a specific letter.
   * Returns cached data if available, otherwise loads from JSON.
   */
  async getLetterData(
    gridMode: string,
    oriKey: string,
    letter: string
  ): Promise<Record<string, unknown>> {
    const frame = placementFrameForGridMode(gridMode);
    this.ensureCacheStructure(frame, oriKey);

    // Return cached data if available
    if (this.cache[frame]?.[oriKey]?.[letter]) {
      return this.cache[frame][oriKey][letter];
    }

    // Check manifest to see if file exists before attempting to fetch
    const fileExists = await this.hasPlacementFile(frame, oriKey, letter);
    if (!fileExists) {
      // Manifest-confirmed absence is a legitimate empty placement.
      if (this.cache[frame]?.[oriKey]) {
        this.cache[frame][oriKey][letter] = {};
      }
      return {};
    }

    const cacheKey = `${frame}:${oriKey}:${letter}`;

    // Check if loading is already in progress
    if (this.loadingPromises.has(cacheKey)) {
      await this.loadingPromises.get(cacheKey);
      return this.cache[frame]?.[oriKey]?.[letter] || {};
    }

    // Start new loading operation
    const loadingPromise = this.loadData(frame, oriKey, letter);
    this.loadingPromises.set(cacheKey, loadingPromise);

    try {
      await loadingPromise;
      return this.cache[frame]?.[oriKey]?.[letter] || {};
    } finally {
      // Failed requests remain retryable.
      this.loadingPromises.delete(cacheKey);
    }
  }

  /**
   * Ensure cache structure exists for gridMode and oriKey
   */
  private ensureCacheStructure(frame: PlacementFrame, oriKey: string): void {
    if (!this.cache[frame]) {
      this.cache[frame] = {} as Record<
        string,
        Record<string, Record<string, unknown>>
      >;
    }
    if (!this.cache[frame][oriKey]) {
      this.cache[frame][oriKey] = {} as Record<string, Record<string, unknown>>;
    }
  }

  /**
   * Load data from JSON file and store in cache
   */
  private async loadData(
    frame: PlacementFrame,
    oriKey: string,
    letter: string
  ): Promise<void> {
    // Files are served under /data/... in the web app
    // Example path: /data/arrow_placement/special/from_layer1/A_placements.json
    const encodedLetter = encodeURIComponent(letter);
    const basePath = `${placementAssetRoot(frame)}/special/${oriKey}/${encodedLetter}_placements.json`;

    const data = (await this.jsonCacheImpl.get(basePath)) as Record<
      string,
      unknown
    >;
    if (this.cache[frame]?.[oriKey]) {
      this.cache[frame][oriKey][letter] = data;
    }
  }
}

// ============================================================================
// DIRECT SINGLETON EXPORT
// ============================================================================
// Use this instead of specialPlacementDataProvider to avoid DI container rebuilds.
// ============================================================================

export const specialPlacementDataProvider = new SpecialPlacementDataProvider();
