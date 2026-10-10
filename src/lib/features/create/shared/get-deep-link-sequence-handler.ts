import { browser } from '$app/env';

import { DeepLinkSequenceHandler } from './services/deep-link-sequence-handler';
import { getDeepLinker } from '#lib/shared/navigation/get-deep-linker.js';

let instance: DeepLinkSequenceHandler | null = null;

export function getDeepLinkSequenceHandler(): DeepLinkSequenceHandler {
	if (!browser) throw new Error('getDeepLinkSequenceHandler() is browser-only');
	return instance ??= new DeepLinkSequenceHandler(getDeepLinker());
}
