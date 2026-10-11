import { browser } from '$app/env';

import { CoralAssetLoader } from './services/coral-asset-loader';

let instance: CoralAssetLoader | null = null;

export function getCoralAssetLoader(): CoralAssetLoader {
	if (!browser) throw new Error('getCoralAssetLoader() is browser-only');
	return instance ??= new CoralAssetLoader();
}
