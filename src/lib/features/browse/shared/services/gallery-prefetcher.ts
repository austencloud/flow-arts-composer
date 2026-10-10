/**
 * GalleryPrefetcher
 *
 * Runs at app boot to warm the browse gallery's in-memory cache from IndexedDB,
 * then syncs fresh data from Firestore in the background. Subscribes to library
 * mutation events to keep the IndexedDB cache current between sessions.
 *
 * The result: when the user opens the gallery, data is already in memory.
 * No skeleton loaders. No Firestore wait.
 */

import type { PublicSequencesLoader } from "#lib/shared/browse/services/public-sequences-loader.js";
import type { GalleryOfflineCache } from "../../../../shared/offline/services/gallery-offline-cache";
import {
  onLibraryMutated,
  onLibrarySequenceAdded,
  onLibrarySequenceUpdated,
} from "#lib/shared/library/library-events.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { GalleryCacheEntry } from "#lib/shared/offline/domain/offline-cache-types.js";
import { db } from "#lib/shared/persistence/database/tka-database.js";
import { isGallerySyncStale } from "./gallery-sync-staleness";

export class GalleryPrefetcher {
  private _isWarmed = false;
  private _isSyncing = false;
  private _hasReadLocalCache = false;
  private _prefetchPromise: Promise<void> | null = null;
  private eventCleanups: (() => void)[] = [];

  constructor(
    private readonly loader: PublicSequencesLoader,
    private readonly offlineCache: GalleryOfflineCache
  ) {}

  get isWarmed(): boolean {
    return this._isWarmed;
  }

  get isSyncing(): boolean {
    return this._isSyncing;
  }

  get prefetchPromise(): Promise<void> | null {
    return this._prefetchPromise;
  }

  /**
   * @param options.skipNetworkSync When true, warm from the local cache and keep
   *   listening for local edits, but don't pull fresh data from Firestore. Set on
   *   a constrained connection: the fresh sync is a speculative multi-MB download
   *   for a gallery the user may never open, so on slow/metered links we defer it
   *   until they actually navigate to Browse (which loads on demand).
   */
  async prefetch(options: { skipNetworkSync?: boolean } = {}): Promise<void> {
    if (this._prefetchPromise) return this._prefetchPromise;

    this._prefetchPromise = this.doPrefetch(options);
    try {
      await this._prefetchPromise;
    } finally {
      this._prefetchPromise = null;
    }
  }

  private async doPrefetch({
    skipNetworkSync = false,
  }: { skipNetworkSync?: boolean } = {}): Promise<void> {
    // Phase 1: Warm from IndexedDB (fast - local disk). Always do this — it's a
    // local read with no network cost, and it's what makes Browse open instantly
    // for returning users even on a slow connection.
    if (!this._hasReadLocalCache) {
      try {
        const cached = await this.offlineCache.loadCached();
        this._hasReadLocalCache = true;
        if (cached.sequences.length > 0) {
          this.loader.warmFromCache(cached.sequences, cached.sourceRefs);
          this._isWarmed = true;
        }
      } catch (error) {
        console.warn("[GalleryPrefetcher] IndexedDB warm failed:", error);
      }
    }

    // Phase 2: Background Firestore sync (non-blocking). Skipped on a constrained
    // connection so we don't speculatively download the whole gallery over 4G,
    // AND skipped when the cache was synced within the TTL — re-pulling the whole
    // publicSequences collection every boot is wasted bandwidth and Firestore
    // reads when nothing changed since the last sync.
    if (!skipNetworkSync && (await this.isSyncStale())) {
      this.backgroundSync();
    }

    // Phase 3: Subscribe to mutation events for real-time IndexedDB patching.
    // Always do this — it keeps the local cache current as the user edits their
    // own library, with no network cost.
    this.subscribeToMutationEvents();
  }

  /**
   * True when the cached gallery is stale enough to re-sync from Firestore.
   * Reads the cache's last-sync watermark and compares it to the TTL. Fails
   * safe to true (sync) when the metadata can't be read, so a cache problem
   * degrades to the previous always-sync behavior rather than never syncing.
   */
  private async isSyncStale(): Promise<boolean> {
    try {
      const { lastSyncedAt } = await this.offlineCache.getStats();
      return isGallerySyncStale(lastSyncedAt, Date.now());
    } catch {
      return true;
    }
  }

  private backgroundSync(): void {
    if (this._isSyncing) return;
    this._isSyncing = true;

    // If we warmed from cache, loadSequenceMetadata() would just return
    // the stale cached data. Use refreshFromFirestore() to force a fresh
    // Firestore query that updates the in-memory cache and persists to IndexedDB.
    //
    // If cache was empty (first launch), this is the initial Firestore fetch.
    // Either way, the gallery gets fresh data.
    const syncPromise = this._isWarmed
      ? this.loader.refreshFromFirestore()
      : this.loader.loadSequenceMetadata();

    syncPromise
      .then(() => {
        this._isWarmed = true;
        this._isSyncing = false;
      })
      .catch((error: unknown) => {
        console.warn("[GalleryPrefetcher] Background sync failed:", error);
        this._isSyncing = false;
      });
  }

  private subscribeToMutationEvents(): void {
    if (this.eventCleanups.length > 0) return;

    // Delete: remove from IndexedDB cache
    this.eventCleanups.push(
      onLibraryMutated((sequenceId) => {
        db.galleryCache
          .delete(sequenceId)
          .catch((err) =>
            console.warn(
              "[GalleryPrefetcher] Failed to delete from cache:",
              err
            )
          );
      })
    );

    // Add: upsert into IndexedDB cache.
    // The galleryCache table stores PublicSequenceIndex-shaped data, but the
    // SequenceData from the event has compatible fields. The converter in
    // GalleryOfflineCache.loadCached() reads whatever fields are present, so
    // extra fields (like steps, isFavorite) are harmlessly ignored by the
    // gallery display layer.
    this.eventCleanups.push(
      onLibrarySequenceAdded((sequence: SequenceData) => {
        const entry: GalleryCacheEntry = {
          id: sequence.id,
          data: JSON.parse(JSON.stringify(sequence)),
          cachedAt: Date.now(),
        };
        db.galleryCache
          .put(entry)
          .catch((err) =>
            console.warn("[GalleryPrefetcher] Failed to add to cache:", err)
          );
      })
    );

    // Update: merge changed fields into existing IndexedDB entry
    this.eventCleanups.push(
      onLibrarySequenceUpdated(
        (sequenceId: string, updates: Record<string, unknown>) => {
          db.galleryCache
            .get(sequenceId)
            .then((existing) => {
              if (!existing) return;
              const merged = { ...existing.data, ...updates };
              return db.galleryCache.put({
                ...existing,
                data: merged as GalleryCacheEntry["data"],
                cachedAt: Date.now(),
              });
            })
            .catch((err) =>
              console.warn("[GalleryPrefetcher] Failed to update cache:", err)
            );
        }
      )
    );
  }
}
