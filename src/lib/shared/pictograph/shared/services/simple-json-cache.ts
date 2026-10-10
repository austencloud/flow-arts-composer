/**
 * Simple JSON Cache
 *
 * Dead simple Map-based cache for JSON files to avoid repeated loading.
 * No complex error hierarchies, just basic caching.
 */

import { assetFetch } from "#lib/shared/net/asset-fetch.js";

export class SimpleJsonCache {
  private cache = new Map<string, unknown>();
  private loadingPromises = new Map<string, Promise<unknown>>();

  /**
   * Get JSON data from cache or load it
   */
  async get<T = unknown>(path: string): Promise<T> {
    // Return cached data if available
    if (this.cache.has(path)) {
      return this.cache.get(path) as T;
    }

    // Return existing promise if already loading
    if (this.loadingPromises.has(path)) {
      return this.loadingPromises.get(path) as Promise<T>;
    }

    // Start loading and cache the promise
    const loadPromise = this.loadJson(path);
    this.loadingPromises.set(path, loadPromise);

    try {
      const data = await loadPromise;
      this.cache.set(path, data);
      this.loadingPromises.delete(path);
      return data as T;
    } catch (error) {
      this.loadingPromises.delete(path);
      throw error;
    }
  }

  /**
   * Check if we have cached data
   */
  has(path: string): boolean {
    return this.cache.has(path);
  }

  /**
   * Invalidate a specific cache entry
   */
  invalidate(path: string): void {
    this.cache.delete(path);
    this.loadingPromises.delete(path);
  }

  /**
   * Clear the cache
   */
  clear(): void {
    this.cache.clear();
    this.loadingPromises.clear();
  }

  /**
   * Get cache stats for debugging
   */
  getStats() {
    return {
      cached: this.cache.size,
      loading: this.loadingPromises.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  private async loadJson(path: string): Promise<unknown> {
    try {
      const response = await assetFetch(path);
      if (!response.ok) {
        // 404s are expected for missing special placement data - just throw without logging
        if (response.status === 404) {
          throw new Error(`File not found: ${path}`);
        }
        // Log other HTTP errors
        const error = new Error(`Failed to fetch ${path}: ${response.status}`);
        console.error(`JSON load failed for ${path}:`, error);
        throw error;
      }
      // Guard against SvelteKit returning its HTML fallback page for missing
      // static files (status 200 but content-type text/html). Without this,
      // response.json() throws a confusing "Unexpected token '<'" SyntaxError.
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error(`File not found: ${path}`);
      }
      return await response.json();
    } catch (error) {
      // Only log non-404 errors
      if (
        !(error instanceof Error && error.message.startsWith("File not found:"))
      ) {
        console.error(`JSON load failed for ${path}:`, error);
      }
      throw error;
    }
  }
}

// Global cache instance
export const jsonCache = new SimpleJsonCache();
