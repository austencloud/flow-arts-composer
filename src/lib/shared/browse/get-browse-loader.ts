import { browser } from '$app/env';

import { PublicSequencesLoader } from '#lib/shared/browse/services/public-sequences-loader.js';
import { getGalleryOfflineCache } from '#lib/shared/offline/get-gallery-offline-cache.js';

let instance: PublicSequencesLoader | null = null;

export function getBrowseLoader(): PublicSequencesLoader {
	if (!browser) throw new Error('getBrowseLoader() is browser-only');
	return instance ??= new PublicSequencesLoader(getGalleryOfflineCache());
}
