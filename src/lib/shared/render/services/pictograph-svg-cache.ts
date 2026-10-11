/**
 * PictographSVGCache
 *
 * Layer 1 of the two-layer pictograph caching system.
 * Persists base pictograph SVGs (without beat numbers) to IndexedDB.
 *
 * Follows the BrowseThumbnailCache pattern exactly for consistency.
 */

import { browser } from "$app/env";
import type { PictographCacheStats } from "./types";

const DB_NAME = "pictograph-svg-cache";
const STORE_NAME = "svgs";
const DB_VERSION = 1;

interface CachedSVGEntry {
  /** Hash key for the pictograph configuration */
  key: string;
  /** SVG string content */
  svg: string;
  /** Timestamp for LRU pruning */
  timestamp: number;
  /** Approximate size in bytes (for stats) */
  sizeBytes: number;
}

export class PictographSVGCache {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (!browser) {
      return Promise.reject(new Error("IndexedDB not available on server"));
    }

    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "key" });
          store.createIndex("timestamp", "timestamp", { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
    });

    return this.dbPromise;
  }

  async get(key: string): Promise<string | null> {
    if (!browser) return null;

    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);

      return new Promise((resolve, reject) => {
        const request = store.get(key);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const result = request.result as CachedSVGEntry | undefined;
          resolve(result?.svg ?? null);
        };
      });
    } catch (error) {
      console.warn("[PictographSVGCache] get failed:", error);
      return null;
    }
  }

  async set(key: string, svg: string): Promise<void> {
    if (!browser) return;

    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      // Estimate size: UTF-16 strings are ~2 bytes per character
      const sizeBytes = svg.length * 2;

      const entry: CachedSVGEntry = {
        key,
        svg,
        timestamp: Date.now(),
        sizeBytes,
      };

      return new Promise((resolve, reject) => {
        const request = store.put(entry);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (error) {
      console.warn("[PictographSVGCache] set failed:", error);
    }
  }

  async has(key: string): Promise<boolean> {
    if (!browser) return false;

    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);

      return new Promise((resolve, reject) => {
        const request = store.count(IDBKeyRange.only(key));
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result > 0);
      });
    } catch (error) {
      console.warn("[PictographSVGCache] has failed:", error);
      return false;
    }
  }

  async clear(): Promise<void> {
    if (!browser) return;

    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      return new Promise((resolve, reject) => {
        const request = store.clear();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (error) {
      console.warn("[PictographSVGCache] clear failed:", error);
    }
  }

  async getStats(): Promise<PictographCacheStats> {
    if (!browser) return { count: 0, sizeBytes: 0 };

    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);

      return new Promise((resolve, reject) => {
        const request = store.openCursor();
        let count = 0;
        let sizeBytes = 0;

        request.onerror = () => reject(request.error);
        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>)
            .result;
          if (cursor) {
            count++;
            const entry = cursor.value as CachedSVGEntry;
            sizeBytes += entry.sizeBytes;
            cursor.continue();
          } else {
            resolve({ count, sizeBytes });
          }
        };
      });
    } catch (error) {
      console.warn("[PictographSVGCache] getStats failed:", error);
      return { count: 0, sizeBytes: 0 };
    }
  }

  async prune(maxSizeBytes: number): Promise<number> {
    if (!browser) return 0;

    try {
      const stats = await this.getStats();
      if (stats.sizeBytes <= maxSizeBytes) return 0;

      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const index = store.index("timestamp");

      // Get all entries sorted by timestamp (oldest first)
      const entries: Array<{ key: string; size: number }> = [];

      await new Promise<void>((resolve, reject) => {
        const request = index.openCursor();
        request.onerror = () => reject(request.error);
        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>)
            .result;
          if (cursor) {
            const entry = cursor.value as CachedSVGEntry;
            entries.push({ key: entry.key, size: entry.sizeBytes });
            cursor.continue();
          } else {
            resolve();
          }
        };
      });

      // Delete oldest entries until under limit
      let currentSize = stats.sizeBytes;
      let deletedCount = 0;

      for (const entry of entries) {
        if (currentSize <= maxSizeBytes) break;

        await new Promise<void>((resolve, reject) => {
          const request = store.delete(entry.key);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve();
        });

        currentSize -= entry.size;
        deletedCount++;
      }

      return deletedCount;
    } catch (error) {
      console.warn("[PictographSVGCache] prune failed:", error);
      return 0;
    }
  }
}
