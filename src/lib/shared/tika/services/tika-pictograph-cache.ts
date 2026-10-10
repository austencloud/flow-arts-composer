/**
 * TikaPictographCache
 *
 * Two-layer caching for TIKA pictograph images:
 * - Layer 1: In-memory Map for instant access during session
 * - Layer 2: IndexedDB for persistence across sessions
 *
 * Caches base64 strings directly since that's what the API returns.
 * Typical pictograph size: 5-15KB base64, so 47 letters × 15KB = ~700KB total.
 */

import { browser } from "$app/env";

export interface TikaPictographCacheStats {
  memoryCount: number;
  persistedCount: number;
  sizeBytes: number;
}

const DB_NAME = "tika-pictograph-cache";
const STORE_NAME = "pictographs";
const DB_VERSION = 1;

interface CachedEntry {
  key: string;
  base64: string;
  timestamp: number;
  sizeBytes: number;
}

export class TikaPictographCache {
  /** Layer 1: In-memory cache for instant access */
  private memoryCache = new Map<string, string>();

  /** IndexedDB promise (singleton) */
  private dbPromise: Promise<IDBDatabase> | null = null;

  /** Track if we've loaded from IDB this session */
  private hasLoadedFromIDB = false;

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

  /**
   * Load all cached pictographs from IndexedDB into memory
   * Called once per session for instant subsequent access
   */
  private async loadFromIDB(): Promise<void> {
    if (!browser || this.hasLoadedFromIDB) return;

    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);

      return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const entries = request.result as CachedEntry[];
          for (const entry of entries) {
            this.memoryCache.set(entry.key, entry.base64);
          }
          this.hasLoadedFromIDB = true;
          resolve();
        };
      });
    } catch (error) {
      console.warn("[TikaPictographCache] Failed to load from IDB:", error);
      this.hasLoadedFromIDB = true; // Don't retry on failure
    }
  }

  async get(key: string): Promise<string | null> {
    // Ensure IDB is loaded
    await this.loadFromIDB();

    // Check memory cache first
    const cached = this.memoryCache.get(key);
    if (cached) {
      return cached;
    }

    return null;
  }

  async set(key: string, base64: string): Promise<void> {
    // Always set in memory cache
    this.memoryCache.set(key, base64);

    // Persist to IndexedDB
    if (!browser) return;

    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      const entry: CachedEntry = {
        key,
        base64,
        timestamp: Date.now(),
        sizeBytes: base64.length,
      };

      return new Promise((resolve, reject) => {
        const request = store.put(entry);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (error) {
      console.warn("[TikaPictographCache] Failed to persist to IDB:", error);
    }
  }

  async has(key: string): Promise<boolean> {
    await this.loadFromIDB();
    return this.memoryCache.has(key);
  }

  async getMany(keys: string[]): Promise<Map<string, string>> {
    await this.loadFromIDB();

    const result = new Map<string, string>();
    for (const key of keys) {
      const cached = this.memoryCache.get(key);
      if (cached) {
        result.set(key, cached);
      }
    }
    return result;
  }

  async clear(): Promise<void> {
    this.memoryCache.clear();

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
      console.warn("[TikaPictographCache] Failed to clear IDB:", error);
    }
  }

  async getStats(): Promise<TikaPictographCacheStats> {
    await this.loadFromIDB();

    const memoryCount = this.memoryCache.size;
    let sizeBytes = 0;
    for (const base64 of this.memoryCache.values()) {
      sizeBytes += base64.length;
    }

    // Get persisted count from IDB
    let persistedCount = 0;
    if (browser) {
      try {
        const db = await this.getDB();
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);

        persistedCount = await new Promise((resolve, reject) => {
          const request = store.count();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);
        });
      } catch {
        // Ignore errors, just report 0
      }
    }

    return { memoryCount, persistedCount, sizeBytes };
  }
}

/**
 * Singleton instance for use across the app
 */
export const tikaPictographCache = new TikaPictographCache();

// Expose to window for easy cache clearing from browser console
// Usage: window.tikaPictographCache.clear() or window.clearTikaCache()
if (typeof window !== "undefined") {
  window.tikaPictographCache = tikaPictographCache;
  window.clearTikaCache = async () => {
    await tikaPictographCache.clear();
    return "Cache cleared";
  };
}
