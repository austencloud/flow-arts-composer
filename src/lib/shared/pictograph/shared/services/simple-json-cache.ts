/**
 * Simple JSON Cache
 *
 * Dead simple Map-based cache for JSON files to avoid repeated loading.
 * One small error type (JsonLoadError) says why a load produced nothing, so
 * callers can stay quiet about failures the cache already handled.
 */

import { whenMotionSettled } from "#lib/shared/foundation/utils/background-scheduling.js";
import {
  assetFetch,
  isCancelledAssetFailure,
} from "#lib/shared/net/asset-fetch.js";

/**
 * Why a JSON load produced no data.
 *
 * - `missing`: the file does not exist (404, or SvelteKit's HTML fallback).
 *   Expected for optional special-placement files, so never logged.
 * - `cancelled`: the request was aborted or the page is unloading. Nothing is
 *   wrong with the asset or the network, so never logged.
 * - `failed`: a real HTTP or network failure. Logged once per path per page,
 *   however many pictographs were waiting on it.
 *
 * Callers above the cache rethrow with `cause`, so a boundary can ask
 * `isJsonLoadFailure` and skip its own report: the cache already made the one
 * that matters.
 */
export type JsonLoadFailureKind = "missing" | "cancelled" | "failed";

export class JsonLoadError extends Error {
  constructor(
    readonly path: string,
    readonly kind: JsonLoadFailureKind,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "JsonLoadError";
  }
}

/** True when `error`, or any error in its `cause` chain, is a JsonLoadError. */
export function isJsonLoadFailure(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 8; depth++) {
    if (current instanceof JsonLoadError) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export class SimpleJsonCache {
  private cache = new Map<string, unknown>();
  private loadingPromises = new Map<string, Promise<unknown>>();
  // Paths whose real failure has been logged. A failed load is not cached, so
  // the next lookup retries, but a flaky connection must not log the same file
  // once for every arrow that asks for it.
  private reportedFailures = new Set<string>();

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
    this.reportedFailures.clear();
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
    let response: Response;
    try {
      response = await assetFetch(path);
    } catch (error) {
      throw this.failure(path, error);
    }
    // 404s are expected for missing special placement data, so never logged.
    if (response.status === 404) {
      throw new JsonLoadError(path, "missing", `File not found: ${path}`);
    }
    if (!response.ok) {
      throw this.failure(
        path,
        new Error(`Failed to fetch ${path}: ${response.status}`)
      );
    }
    // Guard against SvelteKit returning its HTML fallback page for missing
    // static files (status 200 but content-type text/html). Without this,
    // response.json() throws a confusing "Unexpected token '<'" SyntaxError.
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new JsonLoadError(path, "missing", `File not found: ${path}`);
    }
    // The placement tables take well over 100 ms to parse on the main thread.
    // A response that lands while a card is opening parses after it lands.
    // A screen may be waiting on it, so it does not wait for a screen's
    // clearing beat (`neededWorkRuns`).
    await whenMotionSettled({ needed: true });
    try {
      return await response.json();
    } catch (error) {
      // The body stream shares the request's abort signal, so a page that
      // unloads mid-download lands here as well.
      throw this.failure(path, error);
    }
  }

  private failure(path: string, cause: unknown): JsonLoadError {
    if (isCancelledAssetFailure(cause)) {
      return new JsonLoadError(path, "cancelled", `Load cancelled: ${path}`, {
        cause,
      });
    }
    if (!this.reportedFailures.has(path)) {
      this.reportedFailures.add(path);
      console.error(`JSON load failed for ${path}:`, cause);
    }
    return new JsonLoadError(path, "failed", `JSON load failed: ${path}`, {
      cause,
    });
  }
}

// Global cache instance
export const jsonCache = new SimpleJsonCache();
