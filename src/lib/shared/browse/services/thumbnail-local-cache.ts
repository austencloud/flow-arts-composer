/**
 * ThumbnailLocalCache
 *
 * IndexedDB-based local cache for ALL thumbnails (unified system).
 * Uses the hash key from ThumbnailKeyDeriver which already encodes:
 * - Sequence name, prop config (single or cat-dog), light/dark, variant, settings
 *
 * This is Tier 2 in the 4-tier hierarchy:
 * 1. Static bundled (instant, shared)
 * 2. Local IndexedDB (instant, personalized) ← THIS
 * 3. Cloud cache (fast, shared)
 * 4. Local render (slow)
 */

import { browser } from "$app/env";

export interface ThumbnailLocalCacheStats {
  count: number;
  sizeBytes: number;
}

const DB_NAME = "thumbnail-local-cache";
const STORE_NAME = "thumbnails";
// v5: Purge after 8-step column layout change.
const DB_VERSION = 5;
const DEFAULT_MAX_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB default limit
// Persistence is optional. A blocked upgrade or busy disk must not keep the
// gallery waiting before it can try the cloud cache or render queue.
const CACHE_READ_BUDGET_MS = 500;

interface CachedEntry {
  /** Hash key from ThumbnailKeyDeriver */
  key: string;
  /** Thumbnail blob (webp) */
  blob: Blob;
  /** Timestamp for LRU eviction */
  timestamp: number;
  /** Size for tracking */
  sizeBytes: number;
}

export class ThumbnailLocalCache {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private maxSizeBytes: number;
  private isPruning = false; // Concurrency guard to prevent overlapping prune operations

  constructor(maxSizeBytes: number = DEFAULT_MAX_SIZE_BYTES) {
    this.maxSizeBytes = maxSizeBytes;
  }

  private getDB(): Promise<IDBDatabase> {
    if (!browser) {
      return Promise.reject(new Error("IndexedDB not available on server"));
    }

    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        this.dbPromise = null;
        reject(request.error);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // On version bump, delete and recreate the store to purge stale entries
        if (db.objectStoreNames.contains(STORE_NAME)) {
          db.deleteObjectStore(STORE_NAME);
        }
        const store = db.createObjectStore(STORE_NAME, { keyPath: "key" });
        store.createIndex("timestamp", "timestamp", { unique: false });
      };

      request.onsuccess = () => {
        const db = request.result;
        // Another tab may need a newer schema. Keeping this connection open
        // blocks that tab's upgrade until the user closes this page.
        db.onversionchange = () => {
          db.close();
          this.dbPromise = null;
        };
        db.onclose = () => {
          this.dbPromise = null;
        };
        resolve(db);
      };
    });

    return this.dbPromise;
  }

  async get(key: string): Promise<Blob | null> {
    if (!browser) return null;

    return new Promise((resolve) => {
      let settled = false;
      let tx: IDBTransaction | undefined;
      const finish = (blob: Blob | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(blob);
      };
      const timer = setTimeout(() => {
        finish(null);
        // Reclaim a queued transaction too, not just the caller's promise.
        try {
          tx?.abort();
        } catch {
          // The transaction may already have committed.
        }
      }, CACHE_READ_BUDGET_MS);

      void this.getDB()
        .then((db) => {
          // An open blocked by another tab can complete after our deadline.
          // Keep the connection for future requests, but don't run obsolete reads.
          if (settled) return;
          tx = db.transaction(STORE_NAME, "readwrite");
          tx.onabort = () => finish(null);
          tx.onerror = () => finish(null);
          const store = tx.objectStore(STORE_NAME);
          const request = store.get(key);
          request.onerror = () => finish(null);
          request.onsuccess = () => {
            if (settled) return;
            const result = request.result as CachedEntry | undefined;
            if (result) {
              result.timestamp = Date.now();
              store.put(result);
            }
            finish(result?.blob ?? null);
          };
        })
        .catch(() => finish(null));
    });
  }

  async set(key: string, blob: Blob): Promise<void> {
    if (!browser) return;

    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      const entry: CachedEntry = {
        key,
        blob,
        timestamp: Date.now(),
        sizeBytes: blob.size,
      };

      await new Promise<void>((resolve, reject) => {
        const request = store.put(entry);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });

      // Auto-prune if over limit (async, non-blocking)
      this.prune(this.maxSizeBytes).catch(() => {});
    } catch (error) {
      console.warn("[ThumbnailLocalCache] set failed:", error);
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
      console.warn("[ThumbnailLocalCache] has failed:", error);
      return false;
    }
  }

  async delete(key: string): Promise<boolean> {
    if (!browser) return false;

    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      const exists = await new Promise<boolean>((resolve, reject) => {
        const countReq = store.count(IDBKeyRange.only(key));
        countReq.onerror = () => reject(countReq.error);
        countReq.onsuccess = () => resolve(countReq.result > 0);
      });

      if (!exists) return false;

      await new Promise<void>((resolve, reject) => {
        const request = store.delete(key);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });

      return true;
    } catch (error) {
      console.warn("[ThumbnailLocalCache] delete failed:", error);
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
      console.warn("[ThumbnailLocalCache] clear failed:", error);
    }
  }

  async getStats(): Promise<ThumbnailLocalCacheStats> {
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
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            count++;
            const entry = cursor.value as CachedEntry;
            sizeBytes += entry.sizeBytes;
            cursor.continue();
          } else {
            resolve({ count, sizeBytes });
          }
        };
      });
    } catch (error) {
      console.warn("[ThumbnailLocalCache] getStats failed:", error);
      return { count: 0, sizeBytes: 0 };
    }
  }

  async prune(maxSizeBytes: number): Promise<number> {
    if (!browser) return 0;

    // Concurrency guard: prevent overlapping prune operations
    if (this.isPruning) {
      return 0;
    }

    this.isPruning = true;

    try {
      const stats = await this.getStats();
      if (stats.sizeBytes <= maxSizeBytes) {
        this.isPruning = false;
        return 0;
      }

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
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            const entry = cursor.value as CachedEntry;
            entries.push({ key: entry.key, size: entry.sizeBytes });
            cursor.continue();
          } else {
            resolve();
          }
        };
      });

      // Determine which entries to delete (oldest first until under limit)
      let currentSize = stats.sizeBytes;
      const entriesToDelete: Array<{ key: string; size: number }> = [];

      for (const entry of entries) {
        if (currentSize <= maxSizeBytes) break;
        entriesToDelete.push(entry);
        currentSize -= entry.size;
      }

      if (entriesToDelete.length === 0) {
        this.isPruning = false;
        return 0;
      }

      // Delete entries with graceful error handling (individual failures don't stop the batch)
      const deleteResults = await Promise.all(
        entriesToDelete.map(
          (entry) =>
            new Promise<{ key: string; size: number; success: boolean }>((resolve) => {
              const request = store.delete(entry.key);
              request.onsuccess = () => resolve({ ...entry, success: true });
              request.onerror = () => {
                console.warn(`[ThumbnailLocalCache] Failed to delete entry: ${entry.key}`);
                resolve({ ...entry, success: false });
              };
            })
        )
      );

      // Count successful deletions
      const successfulDeletes = deleteResults.filter((r) => r.success);
      return successfulDeletes.length;
    } catch (error) {
      console.warn("[ThumbnailLocalCache] prune failed:", error);
      return 0;
    } finally {
      this.isPruning = false;
    }
  }
}
