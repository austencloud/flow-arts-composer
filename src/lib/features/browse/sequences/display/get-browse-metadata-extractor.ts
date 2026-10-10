import { browser } from '$app/env';
import { BrowseMetadataExtractor } from './services/browse-metadata-extractor';

let instance: BrowseMetadataExtractor | null = null;

export function getBrowseMetadataExtractor(): BrowseMetadataExtractor {
	if (!browser) throw new Error('getBrowseMetadataExtractor() is browser-only');
	return instance ??= new BrowseMetadataExtractor();
}
