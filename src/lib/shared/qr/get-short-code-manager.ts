import { browser } from '$app/env';
import { ShortCodeManager, type ShortCodeSequenceLoader } from './services/short-code-manager';
import { getPublicSequenceHashMatcher } from '#lib/shared/sequence-viewer/get-public-sequence-hash-matcher.js';

let instance: ShortCodeManager | null = null;
let _browseLoader: ShortCodeSequenceLoader | null = null;

/**
 * Must be called once from di/index.ts after the browse container is built,
 * before any consumer calls getShortCodeManager().
 */
export function configureShortCodeManager(browseLoader: ShortCodeSequenceLoader): void {
	_browseLoader = browseLoader;
}

export function getShortCodeManager(): ShortCodeManager {
	if (!browser) throw new Error('getShortCodeManager() is browser-only');
	if (!instance) {
		if (!_browseLoader) {
			throw new Error('getShortCodeManager(): call configureShortCodeManager() first');
		}
		instance = new ShortCodeManager(
			_browseLoader,
			getPublicSequenceHashMatcher(),
		);
	}
	return instance;
}
