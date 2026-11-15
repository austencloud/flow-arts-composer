/**
 * Offline Cache State Factory
 *
 * Reactive wrapper around OfflineCacheOrchestrator.
 * DI service holds logic, this factory adds Svelte 5 reactivity.
 */

import type { OfflineCacheOrchestrator } from "../services/offline-cache-orchestrator";
import type {
  DownloadForOfflineResult,
  OfflineCachePhase,
  OfflineCacheProgress,
  OfflineCacheStats,
} from "../domain/offline-cache-types";

export interface OfflineCacheState {
  readonly phase: OfflineCachePhase;
  readonly progress: OfflineCacheProgress;
  readonly isOfflineReady: boolean;
  /** Outcome of the last explicit download run (null before the first). */
  readonly lastDownloadResult: DownloadForOfflineResult | null;
  /** Populated when phase is "error"; cleared on the next run. */
  readonly errorMessage: string | null;
  startBackgroundCache(): Promise<void>;
  downloadForOffline(): Promise<DownloadForOfflineResult | null>;
  cancel(): void;
  getCacheStats(): Promise<OfflineCacheStats>;
  clearOfflineCache(): Promise<void>;
}

export function createOfflineCacheState(orchestrator: OfflineCacheOrchestrator): OfflineCacheState {
  let phase = $state<OfflineCachePhase>("idle");
  let progress = $state<OfflineCacheProgress>({ cached: 0, total: 0, currentTask: "" });
  let isOfflineReady = $state(false);
  let lastDownloadResult = $state<DownloadForOfflineResult | null>(null);
  let errorMessage = $state<string | null>(null);

  async function startBackgroundCache() {
    // Browse's first cards outrank the offline save: wait until the page has
    // been quiet for a while. A cancel or explicit download meanwhile wins.
    const go = await orchestrator.waitForBackgroundSlot();
    if (!go) return;
    phase = "caching";
    errorMessage = null;
    progress = { cached: 0, total: 0, currentTask: "Gallery metadata" };
    try {
      await orchestrator.startBackgroundCache();
      const stats = await orchestrator.getCacheStats();
      isOfflineReady = stats.isOfflineReady;
      phase = "ready";
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Background caching failed";
      phase = "error";
    }
  }

  async function downloadForOffline(): Promise<DownloadForOfflineResult | null> {
    phase = "caching";
    errorMessage = null;
    progress = { cached: 0, total: 0, currentTask: "Downloading..." };
    try {
      lastDownloadResult = await orchestrator.downloadForOffline((done, total) => {
        progress = { cached: done, total, currentTask: "Downloading..." };
      });
      const stats = await orchestrator.getCacheStats();
      isOfflineReady = stats.isOfflineReady;
      phase = "ready";
      return lastDownloadResult;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Download failed";
      phase = "error";
      return null;
    }
  }

  function cancel() {
    orchestrator.cancel();
    phase = "idle";
  }

  async function getCacheStats(): Promise<OfflineCacheStats> {
    return orchestrator.getCacheStats();
  }

  async function clearOfflineCache() {
    await orchestrator.clearOfflineCache();
    isOfflineReady = false;
    phase = "idle";
  }

  // Check initial state
  orchestrator.getCacheStats().then((stats) => {
    isOfflineReady = stats.isOfflineReady;
    if (stats.isOfflineReady) phase = "ready";
  });

  return {
    get phase() { return phase; },
    get progress() { return progress; },
    get isOfflineReady() { return isOfflineReady; },
    get lastDownloadResult() { return lastDownloadResult; },
    get errorMessage() { return errorMessage; },
    startBackgroundCache,
    downloadForOffline,
    cancel,
    getCacheStats,
    clearOfflineCache,
  };
}
