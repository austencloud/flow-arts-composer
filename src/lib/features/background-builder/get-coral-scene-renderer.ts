import { browser } from '$app/env';
import { CoralSceneRenderer } from './services/coral-scene-renderer';
import { getCoralAssetLoader } from './get-coral-asset-loader';

let instance: CoralSceneRenderer | null = null;

export function getCoralSceneRenderer(): CoralSceneRenderer {
	if (!browser) throw new Error('getCoralSceneRenderer() is browser-only');
	return instance ??= new CoralSceneRenderer(getCoralAssetLoader());
}
