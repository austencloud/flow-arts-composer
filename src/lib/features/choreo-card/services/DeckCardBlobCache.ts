import { browser } from "$app/env";

const DB_NAME = "deck-card-cache";
const STORE_NAME = "cards";
const DB_VERSION = 3;
const MAX_SIZE_BYTES = 200 * 1024 * 1024;

interface CachedCardEntry {
  key: string;
  frontBlob: Blob;
  backBlob: Blob;
  label: string;
  timestamp: number;
  sizeBytes: number;
}

export class DeckCardBlobCache {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private isPruning = false;

  private getDB(): Promise<IDBDatabase> {
    if (!browser) return Promise.reject(new Error("IndexedDB not available"));
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

  async get(key: string): Promise<{ frontBlob: Blob; backBlob: Blob; label: string } | null> {
    if (!browser) return null;
    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      return new Promise((resolve, reject) => {
        const request = store.get(key);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const result = request.result as CachedCardEntry | undefined;
          if (result) {
            result.timestamp = Date.now();
            store.put(result);
            resolve({ frontBlob: result.frontBlob, backBlob: result.backBlob, label: result.label });
          } else {
            resolve(null);
          }
        };
      });
    } catch {
      return null;
    }
  }

  async getMultiple(keys: string[]): Promise<Map<string, { frontBlob: Blob; backBlob: Blob; label: string }>> {
    const results = new Map<string, { frontBlob: Blob; backBlob: Blob; label: string }>();
    if (!browser || keys.length === 0) return results;
    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const now = Date.now();

      await Promise.all(keys.map(key => new Promise<void>((resolve) => {
        const request = store.get(key);
        request.onsuccess = () => {
          const entry = request.result as CachedCardEntry | undefined;
          if (entry) {
            entry.timestamp = now;
            store.put(entry);
            results.set(key, { frontBlob: entry.frontBlob, backBlob: entry.backBlob, label: entry.label });
          }
          resolve();
        };
        request.onerror = () => resolve();
      })));

      return results;
    } catch {
      return results;
    }
  }

  async set(key: string, frontBlob: Blob, backBlob: Blob, label: string): Promise<void> {
    if (!browser) return;
    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const entry: CachedCardEntry = {
        key,
        frontBlob,
        backBlob,
        label,
        timestamp: Date.now(),
        sizeBytes: frontBlob.size + backBlob.size,
      };
      await new Promise<void>((resolve, reject) => {
        const request = store.put(entry);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
      this.prune().catch(() => {});
    } catch {
      // silent
    }
  }

  async delete(key: string): Promise<void> {
    if (!browser) return;
    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      await new Promise<void>((resolve, reject) => {
        const request = store.delete(key);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch {
      // silent
    }
  }

  async clear(): Promise<void> {
    if (!browser) return;
    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      await new Promise<void>((resolve, reject) => {
        const request = store.clear();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch {
      // silent
    }
  }

  private async prune(): Promise<void> {
    if (this.isPruning) return;
    this.isPruning = true;
    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);

      let totalSize = 0;
      const entries: { key: string; size: number }[] = [];

      await new Promise<void>((resolve, reject) => {
        const request = store.index("timestamp").openCursor();
        request.onerror = () => reject(request.error);
        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            const entry = cursor.value as CachedCardEntry;
            totalSize += entry.sizeBytes;
            entries.push({ key: entry.key, size: entry.sizeBytes });
            cursor.continue();
          } else {
            resolve();
          }
        };
      });

      if (totalSize <= MAX_SIZE_BYTES) return;

      const tx2 = db.transaction(STORE_NAME, "readwrite");
      const store2 = tx2.objectStore(STORE_NAME);

      for (const entry of entries) {
        if (totalSize <= MAX_SIZE_BYTES) break;
        await new Promise<void>((resolve) => {
          const request = store2.delete(entry.key);
          request.onsuccess = () => resolve();
          request.onerror = () => resolve();
        });
        totalSize -= entry.size;
      }
    } catch {
      // silent
    } finally {
      this.isPruning = false;
    }
  }
}

export const deckCardBlobCache = new DeckCardBlobCache();

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error("toBlob failed")),
      "image/png",
    );
  });
}
