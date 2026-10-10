import { browser } from '$app/env';
import { PictographMemoryCache } from './services/pictograph-memory-cache';

let instance: PictographMemoryCache | null = null;

export function getPictographMemoryCache(): PictographMemoryCache {
	if (!browser) throw new Error('getPictographMemoryCache() is browser-only');
	return instance ??= new PictographMemoryCache();
}
