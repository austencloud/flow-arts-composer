import { browser } from '$app/env';
import { BrowseCache } from './services/browse-cache';

let instance: BrowseCache | null = null;

export function getBrowseCache(): BrowseCache {
	if (!browser) throw new Error('getBrowseCache() is browser-only');
	return instance ??= new BrowseCache();
}
