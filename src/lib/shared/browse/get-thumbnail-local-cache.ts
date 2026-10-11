import { browser } from '$app/env';
import { ThumbnailLocalCache } from '#lib/shared/browse/services/thumbnail-local-cache.js';

let instance: ThumbnailLocalCache | null = null;

export function getThumbnailLocalCache(): ThumbnailLocalCache {
	if (!browser) throw new Error('getThumbnailLocalCache() is browser-only');
	return instance ??= new ThumbnailLocalCache();
}
