import { browser } from '$app/env';

import { LayerCompositor } from './services/layer-compositor';

let instance: LayerCompositor | null = null;

export function getLayerCompositor(): LayerCompositor {
	if (!browser) throw new Error('getLayerCompositor() is browser-only');
	return instance ??= new LayerCompositor();
}
