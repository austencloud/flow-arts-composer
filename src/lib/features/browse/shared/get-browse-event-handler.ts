import { browser } from '$app/env';

import { BrowseEventHandler } from './services/browse-event-handler';
import { getBrowseLoader } from '#lib/shared/browse/get-browse-loader.js';

let instance: BrowseEventHandler | null = null;

export function getBrowseEventHandler(): BrowseEventHandler {
	if (!browser) throw new Error('getBrowseEventHandler() is browser-only');
	return instance ??= new BrowseEventHandler(getBrowseLoader());
}
