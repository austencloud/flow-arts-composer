/**
 * Tests for OfflineCacheOrchestrator.
 *
 * These lock in the recently-shipped offline-download fixes, each of which was
 * a silent failure in production:
 *  - the "unsupported env" honesty check (button used to silently no-op in dev/localhost)
 *  - the offline early-return (button used to hang on "Downloading…" forever)
 *  - the converter-wiring guarantee (Settings-first sessions read an empty gallery)
 *  - the background-warm takeover (explicit click used to be lied to with "Nothing to cache yet")
 *  - honest svgsCached / isOfflineReady reporting (used to be hardcoded `true`)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// offlineCachingSupported() requires dev === false. The shared setup file mocks
// $app/env with dev: true; this per-file mock overrides it (same
// pattern as network-conditions.test.ts).
vi.mock("$app/env", () => ({
  browser: true,
  dev: false,
  building: false,
  version: "test",
}));

// The orchestrator pulls these module singletons inside its methods. Mock every
// one BEFORE import so the real module graphs (Dexie, Firebase, Svelte runes)
// never load under jsdom.
vi.mock("#lib/shared/browse/get-browse-loader.js", () => ({
  getBrowseLoader: vi.fn(),
}));
vi.mock("#lib/shared/browse/services/cloud-thumbnail-cache.js", () => ({
  getUrl: vi.fn(),
  loadManifest: vi.fn(async () => 0),
  markMissing: vi.fn(),
}));
vi.mock("#lib/shared/browse/services/thumbnail-key-deriver.js", () => ({
  deriveKey: vi.fn(() => ({ hash: "h" })),
}));
vi.mock("#lib/shared/browse/get-thumbnail-render-orchestrator.js", () => ({
  getThumbnailRenderOrchestrator: vi.fn(() => ({
    buildCloudKey: vi.fn(() => "ck"),
  })),
}));
vi.mock(
  "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js",
  () => ({
    getAnimationVisibilityManager: vi.fn(() => ({ isDarkMode: () => false })),
  })
);
vi.mock("#lib/shared/settings/state/settings-state.svelte.js", () => ({
  settingsService: {
    settings: {
      leftPropType: "staff",
      rightPropType: "staff",
      catDogMode: false,
    },
  },
}));

import { OfflineCacheOrchestrator } from "#lib/shared/offline/services/offline-cache-orchestrator.js";
import { getBrowseLoader } from "#lib/shared/browse/get-browse-loader.js";
import {
  getUrl,
  loadManifest,
  markMissing,
} from "#lib/shared/browse/services/cloud-thumbnail-cache.js";

const OFFLINE_RENDER_PROBE = "/images/grid/diamond_grid.svg";

type Ctor = ConstructorParameters<typeof OfflineCacheOrchestrator>;

// Fakes

function makeNetworkMonitor(overrides: { isOnline?: boolean } = {}) {
  return {
    isOnline: overrides.isOnline ?? true,
    status: { saveData: false, isMetered: false, effectiveType: "4g" },
    onOnlineChange: vi.fn(() => () => {}),
  };
}

function makeGalleryCache(
  opts: { count?: number; lastSyncedAt?: number; sequences?: unknown[] } = {}
) {
  const sequences = opts.sequences ?? [];
  return {
    getStats: vi.fn(async () => ({
      count: opts.count ?? sequences.length,
      lastSyncedAt: opts.lastSyncedAt ?? 1,
    })),
    loadCached: vi.fn(async () => ({ sequences })),
    clear: vi.fn(async () => {}),
  };
}

function makeThumbnailCache() {
  return {
    getStats: vi.fn(async () => ({ count: 0, sizeBytes: 0 })),
    clear: vi.fn(async () => {}),
  };
}

function makeOrchestrator(
  networkMonitor = makeNetworkMonitor(),
  galleryCache = makeGalleryCache(),
  thumbnailCache = makeThumbnailCache()
) {
  const orchestrator = new OfflineCacheOrchestrator(
    networkMonitor as unknown as Ctor[0],
    galleryCache as unknown as Ctor[1],
    thumbnailCache as unknown as Ctor[2]
  );
  return { orchestrator, networkMonitor, galleryCache, thumbnailCache };
}

function sequence(id: string) {
  return { id, word: id.toUpperCase(), name: id.toUpperCase(), loopType: null };
}

/** Poll until a condition holds — for observing an in-flight background warm. */
async function waitFor(cond: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
}

// Environment shims — offlineCachingSupported() needs: dev=false (mocked above),
// serviceWorker in navigator, a global `caches`, and a non-localhost hostname
// (jsdom's default IS localhost, so we stub location to the prod origin).

let cachesMatch: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubGlobal("location", new URL("https://tkaflowarts.com/"));
  Object.defineProperty(navigator, "serviceWorker", {
    value: {},
    configurable: true,
  });
  cachesMatch = vi.fn(async () => undefined);
  vi.stubGlobal("caches", { match: cachesMatch });
  fetchMock = vi.fn(async () => ({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.mocked(getUrl).mockReset();
  vi.mocked(loadManifest).mockResolvedValue(0);
});

// Tests

describe("downloadForOffline — environment gating", () => {
  // Guards the honesty fix: on dev/localhost there is no SW cache to warm into,
  // so the button must report "unsupported-env" instead of silently no-opping.
  it("reports unsupported-env on localhost and fires no network requests", async () => {
    vi.stubGlobal("location", new URL("https://localhost:5173/"));
    const { orchestrator, galleryCache } = makeOrchestrator();

    const result = await orchestrator.downloadForOffline();

    expect(result).toEqual({
      supported: false,
      reason: "unsupported-env",
      warmed: 0,
      total: 0,
      svgsCached: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(galleryCache.loadCached).not.toHaveBeenCalled();
  });

  // Guards the infinite-spinner fix: warming fetches from the network; without
  // one the batch loop used to park in waitForOnline() forever with the button
  // stuck on "Downloading…". The early return must resolve promptly.
  it("resolves promptly with reason 'offline' when the device has no network", async () => {
    const { orchestrator } = makeOrchestrator(
      makeNetworkMonitor({ isOnline: false })
    );

    const result = await Promise.race([
      orchestrator.downloadForOffline(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                "downloadForOffline hung — the offline early-return regressed"
              )
            ),
          500
        )
      ),
    ]);

    expect(result.supported).toBe(true);
    expect(result.reason).toBe("offline");
    expect(result.warmed).toBe(0);
    expect(result.total).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("downloadForOffline — gallery converter wiring", () => {
  // Guards the converter-wiring fix: the gallery converter is only wired when
  // the browse loader is constructed. Going straight to Settings (never opening
  // Browse) used to read an empty list from a populated cache and warm nothing.
  // getBrowseLoader() must run BEFORE the cached sequences are read.
  it("reports empty-gallery and calls getBrowseLoader before loadCached", async () => {
    const { orchestrator, galleryCache } = makeOrchestrator();

    const result = await orchestrator.downloadForOffline();

    expect(result.supported).toBe(true);
    expect(result.reason).toBe("empty-gallery");
    expect(result.warmed).toBe(0);
    expect(result.total).toBe(0);

    expect(getBrowseLoader).toHaveBeenCalled();
    const loaderOrder = vi.mocked(getBrowseLoader).mock.invocationCallOrder[0];
    const manifestOrder = vi.mocked(loadManifest).mock.invocationCallOrder[0];
    const loadCachedOrder = galleryCache.loadCached.mock.invocationCallOrder[0];
    expect(loaderOrder).toBeLessThan(loadCachedOrder);
    expect(manifestOrder).toBeLessThan(loadCachedOrder);
  });
});

describe("downloadForOffline — warm accounting", () => {
  // Guards honest warmed/total accounting: sequences without a cloud thumbnail
  // (getUrl → null) count toward total but not warmed, and progress reports
  // cumulative sequences processed — (0,total) up front, (total,total) at the end.
  it("counts only fetched-ok thumbnails as warmed and reports monotonic progress", async () => {
    const galleryCache = makeGalleryCache({
      sequences: [sequence("a"), sequence("b"), sequence("c")],
    });
    const { orchestrator } = makeOrchestrator(
      makeNetworkMonitor(),
      galleryCache
    );

    // Cloud URL for 2 of 3; the third has no cloud thumbnail.
    vi.mocked(getUrl)
      .mockResolvedValueOnce("https://cloud/a.webp")
      .mockResolvedValueOnce("https://cloud/b.webp")
      .mockResolvedValueOnce(null);

    const progress = vi.fn();
    const result = await orchestrator.downloadForOffline(progress);

    expect(result.supported).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.warmed).toBe(2);
    expect(result.total).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const calls = progress.mock.calls as [number, number][];
    expect(calls[0]).toEqual([0, 3]);
    expect(calls[calls.length - 1]).toEqual([3, 3]);
    for (const [, total] of calls) expect(total).toBe(3);
    for (let i = 1; i < calls.length; i++) {
      expect(calls[i][0]).toBeGreaterThanOrEqual(calls[i - 1][0]);
    }
  });

  // Guards the res.ok gate: a failed fetch (500) must not inflate warmed, but
  // the sequence still counts as processed so progress reaches total.
  it("does not count a non-ok fetch as warmed but still counts it as processed", async () => {
    const galleryCache = makeGalleryCache({
      sequences: [sequence("a"), sequence("b")],
    });
    const { orchestrator } = makeOrchestrator(
      makeNetworkMonitor(),
      galleryCache
    );

    vi.mocked(getUrl).mockResolvedValue("https://cloud/t.webp");
    fetchMock
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false });

    const progress = vi.fn();
    const result = await orchestrator.downloadForOffline(progress);

    expect(result.warmed).toBe(1);
    expect(result.total).toBe(2);
    const calls = progress.mock.calls as [number, number][];
    expect(calls[calls.length - 1]).toEqual([2, 2]);
  });

  it("records confirmed download 404s in the shared missing-thumbnail cache", async () => {
    const galleryCache = makeGalleryCache({
      sequences: [sequence("missing")],
    });
    const { orchestrator } = makeOrchestrator(
      makeNetworkMonitor(),
      galleryCache
    );

    vi.mocked(getUrl).mockResolvedValue("https://cloud/missing.webp");
    fetchMock.mockResolvedValue({ ok: false, status: 404 });

    const result = await orchestrator.downloadForOffline();

    expect(result.warmed).toBe(0);
    expect(markMissing).toHaveBeenCalledOnce();
    expect(markMissing).toHaveBeenCalledWith(
      vi.mocked(getUrl).mock.calls[0]![0]
    );
  });
});

describe("startBackgroundCache — stale manifest guard", () => {
  it("loads the current manifest before resolving any thumbnail URL", async () => {
    const galleryCache = makeGalleryCache({
      sequences: [sequence("a")],
    });
    const { orchestrator } = makeOrchestrator(
      makeNetworkMonitor(),
      galleryCache
    );
    vi.mocked(getUrl).mockResolvedValue("https://cloud/a.webp");

    await orchestrator.startBackgroundCache();

    expect(loadManifest).toHaveBeenCalledOnce();
    expect(getUrl).toHaveBeenCalledOnce();
    expect(vi.mocked(loadManifest).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(getUrl).mock.invocationCallOrder[0]!
    );
  });

  it("stops after the first batch exposes a stale-manifest 404 wave", async () => {
    const sequences = Array.from({ length: 25 }, (_, i) => sequence(`s${i}`));
    const galleryCache = makeGalleryCache({ sequences });
    const { orchestrator } = makeOrchestrator(
      makeNetworkMonitor(),
      galleryCache
    );

    vi.mocked(getUrl).mockResolvedValue("https://cloud/missing.webp");
    fetchMock.mockResolvedValue({ ok: false, status: 404 });

    await orchestrator.startBackgroundCache();

    // 4g background concurrency is 10. Once that first in-flight batch reports
    // more misses than the budget, the remaining 15 entries are never fetched.
    expect(fetchMock).toHaveBeenCalledTimes(10);
    expect(markMissing).toHaveBeenCalledTimes(10);
  });
});

describe("downloadForOffline — background warm takeover", () => {
  // Guards the "Nothing to cache yet" lie fix: Browse kicks off a throttled
  // background warm on mount. An explicit click used to hit the re-entrancy
  // guard, get {0,0} back, and the UI misread that as an empty gallery. The
  // click must cancel the background pass, wait for it to release the guard,
  // and run its own full-speed warm.
  it("takes over an in-flight background warm and reports a real total", async () => {
    const sequences = [sequence("a"), sequence("b")];
    const galleryCache = makeGalleryCache({ sequences });
    const { orchestrator } = makeOrchestrator(
      makeNetworkMonitor(),
      galleryCache
    );

    vi.mocked(getUrl).mockResolvedValue("https://cloud/t.webp");

    // A fetch we control: the background warm parks on it mid-batch.
    let releaseBackgroundFetch!: (v: { ok: boolean }) => void;
    const deferred = new Promise<{ ok: boolean }>((resolve) => {
      releaseBackgroundFetch = resolve;
    });
    let backgroundRound = true;
    fetchMock.mockImplementation(() =>
      backgroundRound ? deferred : Promise.resolve({ ok: true })
    );

    const backgroundPromise = orchestrator.startBackgroundCache();

    // Wait until the background warm is genuinely in flight (fetches parked).
    await waitFor(() => fetchMock.mock.calls.length >= sequences.length);

    // Explicit click while the background warm holds the re-entrancy guard.
    backgroundRound = false;
    const downloadPromise = orchestrator.downloadForOffline();

    releaseBackgroundFetch({ ok: true });

    const [, result] = await Promise.all([backgroundPromise, downloadPromise]);

    // The regression returned {warmed:0, total:0} here. total > 0 proves the
    // click ran its own warm pass instead of bouncing off the guard.
    expect(result.total).toBe(sequences.length);
    expect(result.reason).not.toBe("empty-gallery");
    expect(result.reason).toBeUndefined();
  }, 4000);
});

describe("downloadForOffline — svgsCached honesty", () => {
  // Guards the hardcoded-`true` fix: svgsCached must reflect a REAL probe of
  // the SW Cache Storage for the precached grid SVG, not faith.
  it("is true when the grid-SVG probe hits the SW cache", async () => {
    cachesMatch.mockImplementation(async (request: unknown) =>
      request === OFFLINE_RENDER_PROBE ? {} : undefined
    );
    const { orchestrator } = makeOrchestrator();

    const result = await orchestrator.downloadForOffline();

    expect(result.svgsCached).toBe(true);
    expect(cachesMatch).toHaveBeenCalledWith(OFFLINE_RENDER_PROBE);
  });

  it("is false when the cache probe throws", async () => {
    cachesMatch.mockRejectedValue(new Error("cache storage unavailable"));
    const { orchestrator } = makeOrchestrator();

    const result = await orchestrator.downloadForOffline();

    expect(result.svgsCached).toBe(false);
  });
});

describe("getCacheStats", () => {
  // Guards the storage-panel mapping plus the honest isOfflineReady fix: the
  // old check (galleryCount > 0 alone) flipped "Offline ready" on metadata
  // sync with blank art; readiness now also requires the SVG probe to hit.
  it("maps navigator.storage estimates and reports ready when gallery + SVGs are cached", async () => {
    Object.defineProperty(navigator, "storage", {
      value: {
        estimate: async () => ({ usage: 100, quota: 1000 }),
        persisted: async () => true,
      },
      configurable: true,
    });
    cachesMatch.mockResolvedValue({});
    const galleryCache = makeGalleryCache({ count: 5, lastSyncedAt: 42 });
    const { orchestrator } = makeOrchestrator(
      makeNetworkMonitor(),
      galleryCache
    );

    const stats = await orchestrator.getCacheStats();

    expect(stats.gallerySequenceCount).toBe(5);
    expect(stats.galleryLastSyncedAt).toBe(42);
    expect(stats.thumbnailsCached).toBe(0);
    expect(stats.thumbnailsSizeBytes).toBe(0);
    expect(stats.propSvgsCached).toBe(true);
    expect(stats.isOfflineReady).toBe(true);
    expect(stats.storageUsedBytes).toBe(100);
    expect(stats.storageQuotaBytes).toBe(1000);
    expect(stats.storagePersisted).toBe(true);
  });

  it("falls back to nulls when navigator.storage is unavailable, and stays not-ready without the SVG probe", async () => {
    Object.defineProperty(navigator, "storage", {
      value: undefined,
      configurable: true,
    });
    cachesMatch.mockResolvedValue(undefined); // probe misses
    const galleryCache = makeGalleryCache({ count: 5, lastSyncedAt: 42 });
    const { orchestrator } = makeOrchestrator(
      makeNetworkMonitor(),
      galleryCache
    );

    const stats = await orchestrator.getCacheStats();

    expect(stats.storageUsedBytes).toBeNull();
    expect(stats.storageQuotaBytes).toBeNull();
    expect(stats.storagePersisted).toBe(false);
    expect(stats.propSvgsCached).toBe(false);
    // Gallery has 5 sequences, but no cached SVGs → NOT offline ready.
    expect(stats.isOfflineReady).toBe(false);
  });
});
