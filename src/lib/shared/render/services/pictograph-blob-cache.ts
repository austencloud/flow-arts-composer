import { browser } from "$app/env";
import type { PictographBlobCacheStats } from "./types";

const DB_NAME = "pictograph-blob-cache";
const STORE_NAME = "blobs";
// v10 adds lsp12 only for invisible-placeholder cells. Fully-visible cells
// deliberately keep their lsp11 keys, so upgrading from v9 must preserve them.
const DB_VERSION = 10;

interface CachedBlobEntry {
  /** Hash key for the pictograph configuration (includes size) */
  key: string;
  /** Rasterized image blob (PNG format) */
  blob: Blob;
  /** Timestamp for LRU pruning */
  timestamp: number;
  /** Size in bytes */
  sizeBytes: number;
}

export class PictographBlobCache {
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
        const oldVersion = event.oldVersion;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "key" });
          store.createIndex("timestamp", "timestamp", { unique: false });
        } else if (oldVersion < 9) {
          const tx = (event.target as IDBOpenDBRequest).transaction!;
          tx.objectStore(STORE_NAME).clear();
        }
      };

      request.onsuccess = () => resolve(request.result);
    });

    return this.dbPromise;
  }

  async get(key: string): Promise<Blob | null> {
    if (!browser) return null;

    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);

      return new Promise((resolve, reject) => {
        const request = store.get(key);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const result = request.result as CachedBlobEntry | undefined;
          resolve(result?.blob ?? null);
        };
      });
    } catch (error) {
      console.warn("[PictographBlobCache] get failed:", error);
      return null;
    }
  }

  async set(key: string, blob: Blob): Promise<void> {
    if (!browser) return;

    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      const entry: CachedBlobEntry = {
        key,
        blob,
        timestamp: Date.now(),
        sizeBytes: blob.size,
      };

      return new Promise((resolve, reject) => {
        const request = store.put(entry);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (error) {
      console.warn("[PictographBlobCache] set failed:", error);
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
      console.warn("[PictographBlobCache] has failed:", error);
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
      console.warn("[PictographBlobCache] delete failed:", error);
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
      console.warn("[PictographBlobCache] clear failed:", error);
    }
  }

  async getStats(): Promise<PictographBlobCacheStats> {
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
            const entry = cursor.value as CachedBlobEntry;
            sizeBytes += entry.sizeBytes;
            cursor.continue();
          } else {
            resolve({ count, sizeBytes });
          }
        };
      });
    } catch (error) {
      console.warn("[PictographBlobCache] getStats failed:", error);
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

      const entries: Array<{ key: string; size: number }> = [];

      await new Promise<void>((resolve, reject) => {
        const request = index.openCursor();
        request.onerror = () => reject(request.error);
        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>)
            .result;
          if (cursor) {
            const entry = cursor.value as CachedBlobEntry;
            entries.push({ key: entry.key, size: entry.sizeBytes });
            cursor.continue();
          } else {
            resolve();
          }
        };
      });

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
      console.warn("[PictographBlobCache] prune failed:", error);
      return 0;
    }
  }
}

let hmrPictographBlobCacheInstance: PictographBlobCache | null =
  import.meta.hot?.data?.pictographBlobCacheInstance ?? null;

if (import.meta.hot) {
  import.meta.hot.dispose((data) => {
    data.pictographBlobCacheInstance = hmrPictographBlobCacheInstance;
  });
}

function getPictographBlobCache(): PictographBlobCache {
  if (!hmrPictographBlobCacheInstance) {
    hmrPictographBlobCacheInstance = new PictographBlobCache();
  }
  return hmrPictographBlobCacheInstance;
}

export const pictographBlobCache = getPictographBlobCache();
