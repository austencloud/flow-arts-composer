import { dev } from "$app/environment";
import type { NetworkStatusMonitor } from "$lib/shared/sync/services/network-status-monitor";
import type { GalleryOfflineCache } from "./gallery-offline-cache";
import type {
  DownloadForOfflineResult,
  OfflineCacheStats,
} from "../domain/offline-cache-types";
import type { ThumbnailLocalCache } from "$lib/shared/browse/services/thumbnail-local-cache";
import {
  deriveKey,
  type ThumbnailRenderInput,
} from "$lib/shared/browse/services/thumbnail-key-deriver";
import {
  getUrl,
  loadManifest,
  markMissing,
} from "$lib/shared/browse/services/cloud-thumbnail-cache";
import { getThumbnailRenderOrchestrator } from "$lib/shared/browse/get-thumbnail-render-orchestrator";
import { sequenceGridJoinKey } from "@tka/render-core";
import { getBrowseLoader } from "$lib/shared/browse/get-browse-loader";
import { getAnimationVisibilityManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
import { settingsService } from "$lib/shared/settings/state/settings-state.svelte";

// A precached grid SVG that every diamond pictograph needs. Its presence in the
// SW Cache Storage is a reliable proxy for "pictographs can render offline".
const OFFLINE_RENDER_PROBE = "/images/grid/diamond_grid.svg";
const MAX_BACKGROUND_MISSING_THUMBNAILS = 3;

/**
 * Is there a service-worker cache to warm into HERE? Offline caching is a
 * production/PWA capability: the SW registers prod-only (hooks.client.ts) and
 * bypasses localhost/127.0.0.1 (sw.js), while dev actively unregisters SWs and
 * wipes Cache Storage each load to protect HMR. Warming does nothing durable
 * without it, so the button must say so instead of silently no-opping.
 */
function offlineCachingSupported(): boolean {
  if (dev) return false;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
    return false;
  if (typeof caches === "undefined") return false;
  const host = typeof location !== "undefined" ? location.hostname : "";
  if (host === "localhost" || host === "127.0.0.1") return false;
  return true;
}

/** Cumulative-progress callback: (sequences processed, total). */
type WarmProgress = (done: number, total: number) => void;

export class OfflineCacheOrchestrator {
  private cancelled = false;
  private prefetching = false;

  constructor(
    private networkMonitor: NetworkStatusMonitor,
    private galleryCache: GalleryOfflineCache,
    private thumbnailCache: ThumbnailLocalCache
  ) {}

  /**
   * Adaptive concurrency prefetch (throttles to connection quality).
   */
  async startBackgroundCache(): Promise<void> {
    this.cancelled = false;

    // Silent background warm only where a SW cache exists to warm into.
    if (!offlineCachingSupported()) return;

    const stats = await this.galleryCache.getStats();
    if (stats.count === 0) {
      return;
    }

    // The gallery converter is wired when the browse loader is first
    // constructed. Ensure it exists so a session that never opened Browse
    // still reads its cached sequences.
    getBrowseLoader();
    await loadManifest();
    await this.warmCloudThumbnails(false);
  }

  /** True when this environment can actually cache for offline (prod PWA). */
  isOfflineCachingSupported(): boolean {
    return offlineCachingSupported();
  }

  async downloadForOffline(
    onProgress?: WarmProgress
  ): Promise<DownloadForOfflineResult> {
    if (!offlineCachingSupported()) {
      return {
        supported: false,
        reason: "unsupported-env",
        warmed: 0,
        total: 0,
        svgsCached: false,
      };
    }

    // Warming fetches from the network; without one the batch loop would park
    // in waitForOnline() forever with the button stuck on "Downloading…".
    if (!this.networkMonitor.isOnline) {
      return {
        supported: true,
        reason: "offline",
        warmed: 0,
        total: 0,
        svgsCached: await this.checkPropSvgsCached(),
      };
    }

    // Guarantee the gallery converter is set before reading cached sequences —
    // without this, going straight to Settings (never opening Browse) reads an
    // empty list from an otherwise-populated cache and warms nothing.
    getBrowseLoader();
    await loadManifest();

    // An explicit click outranks the throttled background warm that Browse
    // kicks off on mount. Cancel it and wait for it to release the guard —
    // otherwise the re-entrancy check reports {0,0}, which the UI would
    // misread as an empty gallery.
    if (this.prefetching) {
      this.cancelled = true;
      await this.waitForWarmRelease();
    }
    this.cancelled = false;

    const { warmed, total } = await this.warmCloudThumbnails(true, onProgress);
    return {
      supported: true,
      reason: total === 0 ? "empty-gallery" : undefined,
      warmed,
      total,
      svgsCached: await this.checkPropSvgsCached(),
    };
  }

  cancel(): void {
    this.cancelled = true;
  }

  /**
   * Wait for a running warm pass to notice the cancel flag and release the
   * re-entrancy guard. The batch loop checks between batches and the pause
   * waits poll at 1s, so this resolves within about a second.
   */
  private async waitForWarmRelease(): Promise<void> {
    while (this.prefetching) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  async getCacheStats(): Promise<OfflineCacheStats> {
    const [galleryStats, thumbnailStats, propSvgsCached, storage] =
      await Promise.all([
        this.galleryCache.getStats(),
        this.thumbnailCache.getStats(),
        this.checkPropSvgsCached(),
        this.checkStorage(),
      ]);
    return {
      gallerySequenceCount: galleryStats.count,
      galleryLastSyncedAt: galleryStats.lastSyncedAt,
      thumbnailsCached: thumbnailStats.count,
      thumbnailsSizeBytes: thumbnailStats.sizeBytes,
      propSvgsCached,
      // Honest readiness: pictographs only draw offline when their SVGs are in
      // the SW cache AND there's a cached gallery to show. The old check
      // (galleryCount > 0 alone) flipped "Offline ready" on metadata sync, with
      // blank art and zero downloaded assets.
      isOfflineReady: galleryStats.count > 0 && propSvgsCached,
      ...storage,
    };
  }

  /**
   * Device storage picture for the Storage panel: how much the origin uses,
   * how much the browser will allow, and whether it granted durable storage
   * (requested once at boot in hooks.client.ts). All best-effort — nulls where
   * the API is unavailable.
   */
  private async checkStorage(): Promise<
    Pick<
      OfflineCacheStats,
      "storageUsedBytes" | "storageQuotaBytes" | "storagePersisted"
    >
  > {
    const fallback = {
      storageUsedBytes: null,
      storageQuotaBytes: null,
      storagePersisted: false,
    };
    if (typeof navigator === "undefined" || !navigator.storage?.estimate)
      return fallback;
    try {
      const [estimate, persisted] = await Promise.all([
        navigator.storage.estimate(),
        navigator.storage.persisted?.() ?? Promise.resolve(false),
      ]);
      return {
        storageUsedBytes: estimate.usage ?? null,
        storageQuotaBytes: estimate.quota ?? null,
        storagePersisted: persisted,
      };
    } catch {
      return fallback;
    }
  }

  async clearOfflineCache(): Promise<void> {
    this.cancel();
    await Promise.all([this.galleryCache.clear(), this.thumbnailCache.clear()]);
  }

  /**
   * Real check (replaces a hardcoded `true`): is the precached pictograph SVG
   * set actually present in the SW Cache Storage?
   */
  private async checkPropSvgsCached(): Promise<boolean> {
    if (typeof caches === "undefined") return false;
    try {
      return !!(await caches.match(OFFLINE_RENDER_PROBE));
    } catch {
      return false;
    }
  }

  /**
   * Warm the service-worker cache for gallery thumbnails the cloud is known to
   * hold, so the browse gallery's cloud tier serves them offline.
   *
   * We resolve each sequence's cloud URL via the SAME canonical key the gallery
   * renderer uses (`deriveKey` -> `buildCloudKey` -> `getUrl`) and `fetch()` it,
   * which lands the response in the SW's stale-while-revalidate cache for
   * firebasestorage. Nothing is written to the Dexie thumbnail store — the old
   * code wrote blobs keyed by raw URL that the hash-keyed renderer never read
   * (and which evicted the real cache). The cloud storage path depends only on
   * prop + light/dark + variant + name, NOT on composition/QR, so this warm
   * stays correct across composition toggles. Sequences with no cloud thumbnail
   * fall to the offline local-render path (which now works because the SVGs are
   * cached).
   */
  private async warmCloudThumbnails(
    fullSpeed: boolean,
    onProgress?: WarmProgress
  ): Promise<{ warmed: number; total: number }> {
    if (this.prefetching) return { warmed: 0, total: 0 };
    this.prefetching = true;

    let warmed = 0;
    let processed = 0;
    let total = 0;
    let missing = 0;

    try {
      const { sequences } = await this.galleryCache.loadCached();
      total = sequences.length;
      onProgress?.(0, total);
      if (total === 0) return { warmed, total };

      // Render settings the gallery uses, read once. Matching these makes the
      // warmed cloud URL the one the gallery will later fetch.
      const renderOrchestrator = getThumbnailRenderOrchestrator();
      const lightMode = !getAnimationVisibilityManager().isDarkMode();
      const leftPropType = settingsService.settings.leftPropType;
      const rightPropType = settingsService.settings.rightPropType;
      const catDogModeEnabled = settingsService.settings.catDogMode ?? false;

      const concurrency = fullSpeed ? 10 : this.getConcurrency();

      for (let i = 0; i < sequences.length; i += concurrency) {
        if (this.cancelled) break;
        if (!fullSpeed && missing >= MAX_BACKGROUND_MISSING_THUMBNAILS) break;

        // Pause while the tab is hidden - save battery on mobile.
        if (typeof document !== "undefined" && document.hidden) {
          await this.waitForVisible();
        }

        if (this.cancelled) break;

        // Pause if the device goes offline mid-batch.
        if (!this.networkMonitor.isOnline) {
          await this.waitForOnline();
        }

        if (this.cancelled) break;

        const batch = sequences.slice(i, i + concurrency);

        await Promise.allSettled(
          batch.map(async (sequence) => {
            if (this.cancelled) return;

            try {
              const input: ThumbnailRenderInput = {
                sequenceName: sequence.word || sequence.name || "",
                sequenceId: sequence.id,
                leftPropType,
                rightPropType,
                catDogModeEnabled,
                lightMode,
                variant: "gallery",
                loopType: sequence.loopType ?? null,
                gridJoin: sequenceGridJoinKey(sequence) || undefined,
              };

              const cloudKey = renderOrchestrator.buildCloudKey(
                deriveKey(input)
              );

              // The current manifest and the per-browser missing-object cache
              // filter this list before any image bytes are requested.
              const url = await getUrl(cloudKey);
              if (!url) return;

              // Warm the SW Cache Storage; no local IndexedDB write.
              const res = await fetch(url);
              if (res.ok) {
                warmed++;
              } else if (res.status === 404) {
                markMissing(cloudKey);
                missing++;
              }
            } catch {
              // Network failure for one sequence shouldn't abort the batch.
            } finally {
              processed++;
              onProgress?.(processed, total);
            }
          })
        );
      }
    } finally {
      this.prefetching = false;
    }

    return { warmed, total };
  }

  /**
   * Choose batch concurrency based on the current connection quality.
   * Falls back to a conservative value when the Network Information API is
   * unavailable or the type is unknown.
   */
  private getConcurrency(): number {
    const status = this.networkMonitor.status;

    if (status.saveData) return 1;
    if (status.isMetered) return 1;

    switch (status.effectiveType) {
      case "4g":
        return 10;
      case "3g":
        return 3;
      case "2g":
      case "slow-2g":
        return 1;
      default:
        return 5;
    }
  }

  /**
   * Resolve when the document becomes visible again.
   * Used to pause background work while the tab is hidden.
   */
  private waitForVisible(): Promise<void> {
    return new Promise((resolve) => {
      // Poll cancelled flag so cancel() breaks out of the wait
      const interval = setInterval(() => {
        if (this.cancelled) {
          clearInterval(interval);
          document.removeEventListener("visibilitychange", handler);
          resolve();
        }
      }, 1000);

      const handler = () => {
        if (!document.hidden) {
          clearInterval(interval);
          document.removeEventListener("visibilitychange", handler);
          resolve();
        }
      };
      document.addEventListener("visibilitychange", handler);
    });
  }

  /**
   * Resolve when the network comes back online.
   * Used to pause background work when the device loses connectivity.
   */
  private waitForOnline(): Promise<void> {
    return new Promise((resolve) => {
      // Poll cancelled flag so cancel() breaks out of the wait
      const interval = setInterval(() => {
        if (this.cancelled) {
          clearInterval(interval);
          unsub();
          resolve();
        }
      }, 1000);

      const unsub = this.networkMonitor.onOnlineChange((isOnline) => {
        if (isOnline) {
          clearInterval(interval);
          unsub();
          resolve();
        }
      });
    });
  }
}
