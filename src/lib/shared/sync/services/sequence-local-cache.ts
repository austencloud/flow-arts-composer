/**
 * SequenceLocalCache
 *
 * IndexedDB-based local cache for sequence data.
 * Enables instant sequence loading for multi-device sync scenarios.
 *
 * Uses LRU (Least Recently Used) eviction when cache exceeds size limit.
 * Timestamps are updated on access to keep frequently-used sequences cached.
 */

import { browser } from "$app/env";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { SequenceLocalCacheStats } from "./types";

const DB_NAME = "sequence-local-cache";
const STORE_NAME = "sequences";
const DB_VERSION = 1;
const DEFAULT_MAX_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB default limit

interface CachedSequence {
  /** Unique sequence identifier (keyPath) */
  sequenceId: string;
  /** The full sequence data */
  data: SequenceData;
  /** Timestamp for LRU eviction (updated on access) */
  timestamp: number;
  /** Estimated size for quota tracking */
  sizeBytes: number;
}

export class SequenceLocalCache {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private maxSizeBytes: number;
  private isPruning = false;

  constructor(maxSizeBytes: number = DEFAULT_MAX_SIZE_BYTES) {
    this.maxSizeBytes = maxSizeBytes;
  }

  /**
   * Get or create the IndexedDB database connection
   */
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
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: "sequenceId",
          });
          // Index for LRU eviction (sort by oldest timestamp)
          store.createIndex("timestamp", "timestamp", { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
    });

    return this.dbPromise;
  }

  /**
   * Estimate the byte size of a sequence for quota tracking
   */
  private estimateSize(data: SequenceData): number {
    try {
      return JSON.stringify(data).length;
    } catch {
      // Fallback for circular references or other issues
      return 10000; // Conservative estimate
    }
  }

  async get(sequenceId: string): Promise<SequenceData | null> {
    if (!browser) return null;

    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      return new Promise((resolve, reject) => {
        const request = store.get(sequenceId);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const result = request.result as CachedSequence | undefined;
          if (result) {
            // Update timestamp on access (LRU)
            result.timestamp = Date.now();
            store.put(result);
            resolve(result.data);
          } else {
            resolve(null);
          }
        };
      });
    } catch (error) {
      console.warn("[SequenceLocalCache] get failed:", error);
      return null;
    }
  }

  async set(sequenceId: string, data: SequenceData): Promise<void> {
    if (!browser) return;

    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      const entry: CachedSequence = {
        sequenceId,
        data,
        timestamp: Date.now(),
        sizeBytes: this.estimateSize(data),
      };

      await new Promise<void>((resolve, reject) => {
        const request = store.put(entry);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });

      // Auto-prune if over limit (async, non-blocking)
      this.prune(this.maxSizeBytes).catch((error) => {
        // Fire-and-forget: prune failure is non-fatal, but surface it for debugging.
        console.warn("[SequenceLocalCache] auto-prune failed:", error);
      });
    } catch (error) {
      console.warn("[SequenceLocalCache] set failed:", error);
    }
  }

  async has(sequenceId: string): Promise<boolean> {
    if (!browser) return false;

    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);

      return new Promise((resolve, reject) => {
        const request = store.count(IDBKeyRange.only(sequenceId));
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result > 0);
      });
    } catch (error) {
      console.warn("[SequenceLocalCache] has failed:", error);
      return false;
    }
  }

  async getMany(sequenceIds: string[]): Promise<Map<string, SequenceData>> {
    if (!browser) return new Map();

    const results = new Map<string, SequenceData>();

    if (sequenceIds.length === 0) {
      return results;
    }

    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      const now = Date.now();

      // Fetch all sequences in parallel within the same transaction
      await Promise.all(
        sequenceIds.map(
          (sequenceId) =>
            new Promise<void>((resolve) => {
              const request = store.get(sequenceId);
              request.onerror = () => resolve(); // Skip failed fetches
              request.onsuccess = () => {
                const result = request.result as CachedSequence | undefined;
                if (result) {
                  // Update timestamp on access (LRU)
                  result.timestamp = now;
                  store.put(result);
                  results.set(sequenceId, result.data);
                }
                resolve();
              };
            })
        )
      );

      return results;
    } catch (error) {
      console.warn("[SequenceLocalCache] getMany failed:", error);
      return results;
    }
  }

  async delete(sequenceId: string): Promise<void> {
    if (!browser) return;

    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      await new Promise<void>((resolve, reject) => {
        const request = store.delete(sequenceId);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (error) {
      console.warn("[SequenceLocalCache] delete failed:", error);
    }
  }

  async getStats(): Promise<SequenceLocalCacheStats> {
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
            const entry = cursor.value as CachedSequence;
            sizeBytes += entry.sizeBytes;
            cursor.continue();
          } else {
            resolve({ count, sizeBytes });
          }
        };
      });
    } catch (error) {
      console.warn("[SequenceLocalCache] getStats failed:", error);
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
        return 0;
      }

      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const index = store.index("timestamp");

      // Get all entries sorted by timestamp (oldest first)
      const entries: Array<{ sequenceId: string; size: number }> = [];

      await new Promise<void>((resolve, reject) => {
        const request = index.openCursor();
        request.onerror = () => reject(request.error);
        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>)
            .result;
          if (cursor) {
            const entry = cursor.value as CachedSequence;
            entries.push({ sequenceId: entry.sequenceId, size: entry.sizeBytes });
            cursor.continue();
          } else {
            resolve();
          }
        };
      });

      // Determine which entries to delete (oldest first until under limit)
      let currentSize = stats.sizeBytes;
      const entriesToDelete: Array<{ sequenceId: string; size: number }> = [];

      for (const entry of entries) {
        if (currentSize <= maxSizeBytes) break;
        entriesToDelete.push(entry);
        currentSize -= entry.size;
      }

      if (entriesToDelete.length === 0) {
        return 0;
      }

      // Delete entries with graceful error handling
      const deleteResults = await Promise.all(
        entriesToDelete.map(
          (entry) =>
            new Promise<{ sequenceId: string; size: number; success: boolean }>(
              (resolve) => {
                const request = store.delete(entry.sequenceId);
                request.onsuccess = () => resolve({ ...entry, success: true });
                request.onerror = () => {
                  console.warn(
                    `[SequenceLocalCache] Failed to delete entry: ${entry.sequenceId}`
                  );
                  resolve({ ...entry, success: false });
                };
              }
            )
        )
      );

      // Count successful deletions
      const successfulDeletes = deleteResults.filter((r) => r.success);
      return successfulDeletes.length;
    } catch (error) {
      console.warn("[SequenceLocalCache] prune failed:", error);
      return 0;
    } finally {
      this.isPruning = false;
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
    } catch (error) {
      console.warn("[SequenceLocalCache] clear failed:", error);
    }
  }
}
