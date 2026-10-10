import { browser } from '$app/env';
import { GalleryPrefetcher } from './services/gallery-prefetcher';
import { getBrowseLoader } from '#lib/shared/browse/get-browse-loader.js';
import { getGalleryOfflineCache } from '#lib/shared/offline/get-gallery-offline-cache.js';

let instance: GalleryPrefetcher | null = null;

export function getGalleryPrefetcher(): GalleryPrefetcher {
	if (!browser) throw new Error('getGalleryPrefetcher() is browser-only');
	return instance ??= new GalleryPrefetcher(getBrowseLoader(), getGalleryOfflineCache());
}
