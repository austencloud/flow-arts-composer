import { browser } from '$app/env';

import { BrowseThumbnailProvider } from '#lib/shared/browse/services/browse-thumbnail-provider.js';

let instance: BrowseThumbnailProvider | null = null;

export function getBrowseThumbnailProvider(): BrowseThumbnailProvider {
	if (!browser) throw new Error('getBrowseThumbnailProvider() is browser-only');
	return instance ??= new BrowseThumbnailProvider();
}
