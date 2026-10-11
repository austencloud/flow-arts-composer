import { browser } from '$app/env';

import { GalleryOfflineCache } from './services/gallery-offline-cache';

let instance: GalleryOfflineCache | null = null;

export function getGalleryOfflineCache(): GalleryOfflineCache {
	if (!browser) throw new Error('getGalleryOfflineCache() is browser-only');
	return instance ??= new GalleryOfflineCache();
}
