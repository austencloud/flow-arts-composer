import { describe, expect, it, vi } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { PublicSequencesLoader } from "#lib/shared/browse/services/public-sequences-loader.js";
import type { GalleryOfflineCache } from "#lib/shared/offline/services/gallery-offline-cache.js";

const eventListeners = vi.hoisted(() => ({
  mutated: vi.fn(() => vi.fn()),
  added: vi.fn(() => vi.fn()),
  updated: vi.fn(() => vi.fn()),
}));

vi.mock("#lib/shared/library/library-events.js", () => ({
  onLibraryMutated: eventListeners.mutated,
  onLibrarySequenceAdded: eventListeners.added,
  onLibrarySequenceUpdated: eventListeners.updated,
}));

vi.mock("#lib/shared/persistence/database/tka-database.js", () => ({
  db: {
    galleryCache: {
      delete: vi.fn(async () => undefined),
      get: vi.fn(async () => undefined),
      put: vi.fn(async () => undefined),
    },
  },
}));

import { GalleryPrefetcher } from "#lib/features/browse/shared/services/gallery-prefetcher.js";

function makeLoader(overrides: Partial<PublicSequencesLoader> = {}) {
  return {
    warmFromCache: vi.fn(),
    loadSequenceMetadata: vi.fn(async () => []),
    refreshFromFirestore: vi.fn(async () => []),
    ...overrides,
  } as unknown as PublicSequencesLoader;
}

function makeOfflineCache(overrides: Partial<GalleryOfflineCache> = {}) {
  return {
    loadCached: vi.fn(async () => ({
      sequences: [],
      sourceRefs: new Map<string, string>(),
      lastSyncedAt: null,
    })),
    getStats: vi.fn(async () => ({ count: 0, lastSyncedAt: null })),
    ...overrides,
  } as unknown as GalleryOfflineCache;
}

describe("GalleryPrefetcher", () => {
  it("warms from IndexedDB once across repeated local prefetches", async () => {
    const cachedSequence = { id: "cached-sequence" } as SequenceData;
    const loadCached = vi.fn(async () => ({
      sequences: [cachedSequence],
      sourceRefs: new Map([["cached", "users/u/sequences/s"]]),
      lastSyncedAt: Date.now(),
    }));
    const loader = makeLoader();
    const offlineCache = makeOfflineCache({ loadCached });
    const prefetcher = new GalleryPrefetcher(loader, offlineCache);

    await prefetcher.prefetch({ skipNetworkSync: true });
    await prefetcher.prefetch({ skipNetworkSync: true });

    expect(loadCached).toHaveBeenCalledTimes(1);
    expect(loader.warmFromCache).toHaveBeenCalledWith(
      [cachedSequence],
      new Map([["cached", "users/u/sequences/s"]])
    );
    expect(loader.loadSequenceMetadata).not.toHaveBeenCalled();
    expect(eventListeners.mutated).toHaveBeenCalledTimes(1);
    expect(eventListeners.added).toHaveBeenCalledTimes(1);
    expect(eventListeners.updated).toHaveBeenCalledTimes(1);
  });

  it("coalesces background Firestore syncs while one is running", async () => {
    let finishSync!: (sequences: SequenceData[]) => void;
    const sync = new Promise<SequenceData[]>((resolve) => {
      finishSync = resolve;
    });
    const loadSequenceMetadata = vi.fn(() => sync);
    const loader = makeLoader({ loadSequenceMetadata });
    const offlineCache = makeOfflineCache();
    const prefetcher = new GalleryPrefetcher(loader, offlineCache);

    await prefetcher.prefetch();
    await prefetcher.prefetch();

    expect(loadSequenceMetadata).toHaveBeenCalledTimes(1);
    expect(prefetcher.isSyncing).toBe(true);

    finishSync([]);
    await sync;
    await Promise.resolve();

    expect(prefetcher.isSyncing).toBe(false);
    expect(prefetcher.isWarmed).toBe(true);
  });
});
