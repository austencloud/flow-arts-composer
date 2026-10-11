import { OfflineCacheOrchestrator } from './services/offline-cache-orchestrator';
import { getNetworkStatusMonitor } from '#lib/shared/sync/get-network-status-monitor.js';
import { getGalleryOfflineCache } from './get-gallery-offline-cache';
import { getThumbnailLocalCache } from '#lib/shared/browse/get-thumbnail-local-cache.js';

let instance: OfflineCacheOrchestrator | null = null;
export function getOfflineCacheOrchestrator(): OfflineCacheOrchestrator {
  return instance ??= new OfflineCacheOrchestrator(
    getNetworkStatusMonitor(),
    getGalleryOfflineCache(),
    getThumbnailLocalCache()
  );
}
