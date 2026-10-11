import { browser } from '$app/env';
import type { IDirectRenderer } from './services/IDirectRenderer';
import { Canvas2DDirectRenderer } from './services/canvas-2d-direct-renderer';

let instance: IDirectRenderer | null = null;

export function getCanvas2DRenderer(): IDirectRenderer {
	if (!browser) throw new Error('getCanvas2DRenderer() is browser-only');
	return instance ??= new Canvas2DDirectRenderer();
}
