/**
 * Preview Cache Service
 *
 * Persistent IndexedDB storage for share preview images.
 * Survives page refreshes and avoids regenerating unchanged previews.
 */

import { browser } from "$app/environment";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { ShareOptions } from "../domain/models/share-options";
import { createComponentLogger } from "$lib/shared/utils/debug-logger";

const debug = createComponentLogger("PreviewCache");

interface CachedPreview {
  sequenceHash: string;
  options: string; // Serialized relevant options
  imageBlob: Blob;
  timestamp: number;
}

const DB_NAME = "tka-preview-cache";
const DB_VERSION = 1;
const STORE_NAME = "previews";
const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
// Bump whenever card pixels change so retired footer content cannot survive in
// IndexedDB after the renderer has stopped producing it.
const SHARE_PREVIEW_RENDERER_VERSION = 2;

export class PreviewCache {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the IndexedDB database
   */
  private async init(): Promise<void> {
    if (!browser) return;
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error("Failed to open preview cache database:", request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "key" });
          store.createIndex("timestamp", "timestamp", { unique: false });
        }
      };
    });

    return this.initPromise;
  }

  /**
   * Generate a hash of the sequence steps for change detection
   */
  private hashSequence(sequence: SequenceData): string {
    // Create a stable string representation of the sequence steps
    const beatsJson = JSON.stringify({
      steps: sequence.steps,
      startingPlacement: sequence.startingPlacement,
      startPlacement: sequence.startPlacement,
    });

    // FNV-1a hash (Math.imul keeps the multiply overflow-correct in 32-bit)
    let hash = 0x811c9dc5;
    for (let i = 0; i < beatsJson.length; i++) {
      hash ^= beatsJson.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
  }

  /**
   * Generate cache key from sequence ID and options
   * IMPORTANT: All toggle options must be included to avoid stale cache
   */
  private getCacheKey(sequenceId: string, options: ShareOptions): string {
    const optionsKey = JSON.stringify({
      renderer: SHARE_PREVIEW_RENDERER_VERSION,
      format: options.format,
      quality: options.quality,
      addWord: options.addWord,
      addStepNumbers: options.addStepNumbers,
      includeStartPlacement: options.includeStartPlacement,
      addDifficultyLevel: options.addDifficultyLevel,
      showNotes: options.showNotes ?? options.addUserInfo,
      customNotesText: options.customNotesText,
      darkMode: options.darkMode,
      backgroundColor: options.backgroundColor,
      stepSize: options.stepSize,
      margin: options.margin,
    });
    return `${sequenceId}-${optionsKey}`;
  }

  /**
   * Get cached preview blob directly (for reuse in SaveToLibrary, etc.)
   * Returns the blob without converting to object URL
   */
  async getCachedBlob(
    sequence: SequenceData,
    options: ShareOptions
  ): Promise<Blob | null> {
    if (!browser) return null;

    try {
      await this.init();
      if (!this.db) return null;

      const key = this.getCacheKey(sequence.id, options);
      const sequenceHash = this.hashSequence(sequence);

      return new Promise((resolve) => {
        const transaction = this.db!.transaction(STORE_NAME, "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(key);

        request.onsuccess = () => {
          const cached = request.result as
            | (CachedPreview & { key: string })
            | undefined;

          if (!cached) {
            resolve(null);
            return;
          }

          // Check if sequence has changed
          if (cached.sequenceHash !== sequenceHash) {
            debug.log("Sequence changed, cache invalid");
            resolve(null);
            return;
          }

          // Check if cache is stale (older than 7 days)
          const age = Date.now() - cached.timestamp;
          if (age > MAX_CACHE_AGE_MS) {
            debug.log("Cache expired, regenerating");
            resolve(null);
            return;
          }

          // Return the blob directly
          debug.success("Retrieved cached blob from IndexedDB");
          resolve(cached.imageBlob);
        };

        request.onerror = () => {
          console.error("Failed to get cached blob:", request.error);
          resolve(null);
        };
      });
    } catch (error) {
      console.error("Error accessing preview cache:", error);
      return null;
    }
  }

  /**
   * Get cached preview if it exists and hasn't changed
   */
  async getCachedPreview(
    sequence: SequenceData,
    options: ShareOptions
  ): Promise<string | null> {
    if (!browser) return null;

    try {
      await this.init();
      if (!this.db) return null;

      const key = this.getCacheKey(sequence.id, options);
      const sequenceHash = this.hashSequence(sequence);

      return new Promise((resolve) => {
        const transaction = this.db!.transaction(STORE_NAME, "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(key);

        request.onsuccess = async () => {
          const cached = request.result as
            | (CachedPreview & { key: string })
            | undefined;

          if (!cached) {
            resolve(null);
            return;
          }

          // Check if sequence has changed
          if (cached.sequenceHash !== sequenceHash) {
            resolve(null);
            return;
          }

          // Check if cache is stale (older than 7 days)
          const age = Date.now() - cached.timestamp;
          if (age > MAX_CACHE_AGE_MS) {
            debug.log("Cache expired, regenerating");
            resolve(null);
            return;
          }

          // Convert blob to object URL
          const url = URL.createObjectURL(cached.imageBlob);
          debug.success("Using cached preview from IndexedDB");
          resolve(url);
        };

        request.onerror = () => {
          console.error("Failed to get cached preview:", request.error);
          resolve(null);
        };
      });
    } catch (error) {
      console.error("Error accessing preview cache:", error);
      return null;
    }
  }

  /**
   * Store preview in cache
   */
  async setCachedPreview(
    sequence: SequenceData,
    options: ShareOptions,
    imageBlob: Blob
  ): Promise<void> {
    if (!browser) return;

    try {
      await this.init();
      if (!this.db) return;

      const key = this.getCacheKey(sequence.id, options);
      const sequenceHash = this.hashSequence(sequence);

      const cached: CachedPreview & { key: string } = {
        key,
        sequenceHash,
        options: JSON.stringify(options),
        imageBlob,
        timestamp: Date.now(),
      };

      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(cached);

        request.onsuccess = () => {
          resolve();
        };

        request.onerror = () => {
          console.error("Failed to cache preview:", request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error("Error caching preview:", error);
    }
  }

  /**
   * Clear old cache entries (called periodically)
   */
  async clearOldEntries(): Promise<void> {
    if (!browser) return;

    try {
      await this.init();
      if (!this.db) return;

      const cutoffTime = Date.now() - MAX_CACHE_AGE_MS;

      return new Promise((resolve) => {
        const transaction = this.db!.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index("timestamp");
        const range = IDBKeyRange.upperBound(cutoffTime);
        const request = index.openCursor(range);

        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          } else {
            resolve();
          }
        };

        request.onerror = () => {
          console.error("Failed to clear old entries:", request.error);
          resolve();
        };
      });
    } catch (error) {
      console.error("Error clearing old cache entries:", error);
    }
  }

  /**
   * Clear all cached previews
   */
  async clearAll(): Promise<void> {
    if (!browser) return;

    try {
      await this.init();
      if (!this.db) return;

      return new Promise((resolve) => {
        const transaction = this.db!.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => {
          resolve();
        };

        request.onerror = () => {
          console.error("Failed to clear cache:", request.error);
          resolve();
        };
      });
    } catch (error) {
      console.error("Error clearing cache:", error);
    }
  }
}
