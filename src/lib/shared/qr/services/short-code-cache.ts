/**
 * Short Code Cache
 *
 * Persistent cache mapping a sequence's content key (its content hash, or a
 * word fallback — hash-only, no URL-option discriminants) to its resolved
 * short CODE. Post-v2 the value is code-only: a sequence's code is global and
 * content-addressed in Firestore and never varies with URL options, so each
 * caller derives its own URL from the cached code. Resolution cost is a
 * network query, not creation — perfectly cacheable.
 *
 * Two layers, mirroring `pictograph-blob-cache`:
 *   - memory Map: session-fast, codes are tiny strings.
 *   - IndexedDB: cross-session persistence.
 *
 * `ShortCodeManager.createShortCode` consults this first (memory → IDB →
 * Firestore) and writes through on resolve, so every caller benefits.
 *
 * Domain: QR - URL Shortening
 */

import { browser } from "$app/environment";

/** Bump to invalidate every cached code (e.g. if the URL scheme changes).
 *  v2 (2026-07-05): values became code-only — URLs are derived per caller
 *  from their own options, and keys dropped the bp/rp/vm discriminants.
 *  The bump also flushes codes that diverged during the dup-mint-race era.
 *  v3 (2026-09-23): word and hand-path keys became the choreography digest
 *  (`d:<digest>`), and only codes verified to play that choreography are
 *  cached. v2 entries keyed by encoderHash could map two different
 *  choreographies that share a hash to one code. */
export const SHORT_CODE_CACHE_SCHEMA = "v3";

const DB_NAME = "short-code-cache";
const STORE_NAME = "codes";
const DB_VERSION = 1;

/** Default LRU ceiling. Codes are tiny — this is generous. */
const DEFAULT_MAX_ENTRIES = 5000;

export interface ShortCodeCacheValue {
  code: string;
}

interface CachedCodeEntry extends ShortCodeCacheValue {
  key: string;
  timestamp: number;
}

export class ShortCodeCache {
  private memory = new Map<string, ShortCodeCacheValue>();
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

  /** Read a single code. Memory first, then IDB (hydrates memory on IDB hit). */
  async get(key: string): Promise<ShortCodeCacheValue | null> {
    const mem = this.memory.get(key);
    if (mem) return mem;
    if (!browser) return null;

    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const entry = await new Promise<CachedCodeEntry | undefined>(
        (resolve, reject) => {
          const req = store.get(key);
          req.onerror = () => reject(req.error);
          req.onsuccess = () => resolve(req.result as CachedCodeEntry | undefined);
        }
      );
      if (!entry) return null;
      const value: ShortCodeCacheValue = { code: entry.code };
      this.memory.set(key, value);
      return value;
    } catch (error) {
      console.warn("[ShortCodeCache] get failed:", error);
      return null;
    }
  }

  /** Batch read. Returns a Map of only the keys that hit (memory or IDB). */
  async getMany(keys: string[]): Promise<Map<string, ShortCodeCacheValue>> {
    const found = new Map<string, ShortCodeCacheValue>();
    const idbKeys: string[] = [];

    for (const key of keys) {
      const mem = this.memory.get(key);
      if (mem) found.set(key, mem);
      else idbKeys.push(key);
    }

    if (!browser || idbKeys.length === 0) return found;

    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      await Promise.all(
        idbKeys.map(
          (key) =>
            new Promise<void>((resolve) => {
              const req = store.get(key);
              req.onsuccess = () => {
                const entry = req.result as CachedCodeEntry | undefined;
                if (entry) {
                  const value: ShortCodeCacheValue = { code: entry.code };
                  this.memory.set(key, value);
                  found.set(key, value);
                }
                resolve();
              };
              req.onerror = () => resolve();
            })
        )
      );
    } catch (error) {
      console.warn("[ShortCodeCache] getMany failed:", error);
    }

    return found;
  }

  /** Write through both layers. Best-effort on IDB. */
  async set(key: string, value: ShortCodeCacheValue): Promise<void> {
    this.memory.set(key, value);
    if (!browser) return;

    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const entry: CachedCodeEntry = {
        key,
        code: value.code,
        timestamp: Date.now(),
      };
      await new Promise<void>((resolve, reject) => {
        const req = store.put(entry);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve();
      });
    } catch (error) {
      console.warn("[ShortCodeCache] set failed:", error);
    }
  }

  /** LRU prune by oldest timestamp down to maxEntries. */
  async prune(maxEntries: number = DEFAULT_MAX_ENTRIES): Promise<number> {
    if (!browser) return 0;

    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      const count = await new Promise<number>((resolve, reject) => {
        const req = store.count();
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
      });
      if (count <= maxEntries) return 0;

      let toDelete = count - maxEntries;
      let deleted = 0;
      const index = store.index("timestamp");
      await new Promise<void>((resolve, reject) => {
        const req = index.openCursor();
        req.onerror = () => reject(req.error);
        req.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor && toDelete > 0) {
            this.memory.delete((cursor.value as CachedCodeEntry).key);
            cursor.delete();
            toDelete--;
            deleted++;
            cursor.continue();
          } else {
            resolve();
          }
        };
      });
      return deleted;
    } catch (error) {
      console.warn("[ShortCodeCache] prune failed:", error);
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
      console.warn("[ShortCodeCache] clear failed:", error);
    }
  }
}
