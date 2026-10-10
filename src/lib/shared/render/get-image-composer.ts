import { browser } from '$app/env';

import { ImageComposer } from './services/image-composer';
import { getTextRenderer } from './get-text-renderer';
import { getPictographBlobCache } from './get-pictograph-blob-cache';
import { getPictographKeyHasher } from './get-pictograph-key-hasher';
import { getPictographMemoryCache } from './get-pictograph-memory-cache';
import { getCanvas2DRenderer } from './get-canvas-2d-renderer';
import { getLayerCompositor } from './get-layer-compositor';
import type { Canvas2DDirectRenderer } from './services/canvas-2d-direct-renderer';

let instance: ImageComposer | null = null;

export function getImageComposer(): ImageComposer {
	if (!browser) throw new Error('getImageComposer() is browser-only');
	return instance ??= new ImageComposer(
		getTextRenderer(),
		getPictographBlobCache(),
		getPictographKeyHasher(),
		getPictographMemoryCache(),
		getCanvas2DRenderer() as Canvas2DDirectRenderer,
		getLayerCompositor()
	);
}
