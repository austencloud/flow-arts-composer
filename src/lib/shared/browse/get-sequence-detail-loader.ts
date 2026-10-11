import { browser } from '$app/env';
import { SequenceDetailLoader } from '#lib/shared/browse/services/sequence-detail-loader.js';
import { getBrowseLoader } from '#lib/shared/browse/get-browse-loader.js';

let instance: SequenceDetailLoader | null = null;

export function getSequenceDetailLoader(): SequenceDetailLoader {
	if (!browser) throw new Error('getSequenceDetailLoader() is browser-only');
	return instance ??= new SequenceDetailLoader(getBrowseLoader());
}
