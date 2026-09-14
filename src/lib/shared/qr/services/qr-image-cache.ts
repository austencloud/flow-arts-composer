/**
 * QR Image Cache
 *
 * Persistent cache mapping a fully-encoded QR payload (URL + render
 * discriminants) to its rendered SVG + data URL, so the expensive
 * qr-code-styling render + `getRawData` runs once per distinct payload.
 *
 * Two layers, mirroring `pictograph-blob-cache`:
 *   - memory Map: session-fast.
 *   - IndexedDB: cross-session persistence, byte-bounded LRU.
 *
 * Key = encoded URL + size + margin + style + darkMode → changes iff the QR
 * pixels would change → automatic invalidation. `QR_IMAGE_CACHE_SCHEMA` bumps
 * all keys if the QR style is ever redesigned.
 *
 * Domain: QR - Code Generation
 */

import { browser } from "$app/environment";

/** Bump to invalidate every cached QR image (e.g. if the QR style changes). */
export const QR_IMAGE_CACHE_SCHEMA = "v1";

const DB_NAME = "qr-image-cache";
const STORE_NAME = "images";
const DB_VERSION = 1;

/** ~8 MB ceiling. QR dataURLs are small base64 SVGs (~2-5 KB each). */
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

export interface QrImageCacheValue {
  svg: string;
  dataUrl: string;
  /** Present only after both themes' scan assets have been verified. */
  prepared?: { encodedUrl: string; shortCode: string };
}

interface CachedImageEntry extends QrImageCacheValue {
  key: string;
  timestamp: number;
  sizeBytes: number;
}

export class QrImageCache {
  private memory = new Map<string, QrImageCacheValue>();
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

  /** Read. Memory first, then IDB (hydrates memory on IDB hit). */
  async get(key: string): Promise<QrImageCacheValue | null> {
    const mem = this.memory.get(key);
    if (mem) return mem;
    if (!browser) return null;

    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const entry = await new Promise<CachedImageEntry | undefined>(
        (resolve, reject) => {
          const req = store.get(key);
          req.onerror = () => reject(req.error);
          req.onsuccess = () =>
            resolve(req.result as CachedImageEntry | undefined);
        }
      );
      if (!entry) return null;
      const value: QrImageCacheValue = {
        svg: entry.svg,
        dataUrl: entry.dataUrl,
        prepared: entry.prepared,
      };
      this.memory.set(key, value);
      return value;
    } catch (error) {
      console.warn("[QrImageCache] get failed:", error);
      return null;
    }
  }

  /** Write through both layers. Best-effort on IDB. */
  async set(key: string, value: QrImageCacheValue): Promise<void> {
    this.memory.set(key, value);
    if (!browser) return;

    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const entry: CachedImageEntry = {
        key,
        svg: value.svg,
        dataUrl: value.dataUrl,
        prepared: value.prepared,
        timestamp: Date.now(),
        sizeBytes: value.svg.length + value.dataUrl.length,
      };
      await new Promise<void>((resolve, reject) => {
        const req = store.put(entry);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve();
      });
    } catch (error) {
      console.warn("[QrImageCache] set failed:", error);
    }
  }

  /** LRU prune by oldest timestamp until total bytes <= maxBytes. */
  async prune(maxBytes: number = DEFAULT_MAX_BYTES): Promise<number> {
    if (!browser) return 0;

    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const index = store.index("timestamp");

      const entries: Array<{ key: string; size: number }> = [];
      let total = 0;
      await new Promise<void>((resolve, reject) => {
        const req = index.openCursor();
        req.onerror = () => reject(req.error);
        req.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>)
            .result;
          if (cursor) {
            const entry = cursor.value as CachedImageEntry;
            entries.push({ key: entry.key, size: entry.sizeBytes });
            total += entry.sizeBytes;
            cursor.continue();
          } else {
            resolve();
          }
        };
      });

      if (total <= maxBytes) return 0;

      let deleted = 0;
      for (const entry of entries) {
        if (total <= maxBytes) break;
        await new Promise<void>((resolve, reject) => {
          const req = store.delete(entry.key);
          req.onerror = () => reject(req.error);
          req.onsuccess = () => resolve();
        });
        this.memory.delete(entry.key);
        total -= entry.size;
        deleted++;
      }
      return deleted;
    } catch (error) {
      console.warn("[QrImageCache] prune failed:", error);
      return 0;
    }
  }

  async clear(): Promise<void> {
    this.memory.clear();
    if (!browser) return;
    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      await new Promise<void>((resolve, reject) => {
        const req = tx.objectStore(STORE_NAME).clear();
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve();
      });
    } catch (error) {
      console.warn("[QrImageCache] clear failed:", error);
    }
  }
}

/** Process-wide singleton (HMR-stable). */
let hmrQrImageCacheInstance: QrImageCache | null =
  import.meta.hot?.data?.qrImageCacheInstance ?? null;

if (import.meta.hot) {
  import.meta.hot.dispose((data) => {
    data.qrImageCacheInstance = hmrQrImageCacheInstance;
  });
}

export function getQrImageCache(): QrImageCache {
  if (!hmrQrImageCacheInstance) {
    hmrQrImageCacheInstance = new QrImageCache();
  }
  return hmrQrImageCacheInstance;
}
