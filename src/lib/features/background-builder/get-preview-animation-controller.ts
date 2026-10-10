import { browser } from '$app/env';

import { PreviewAnimationController } from './services/preview-animation-controller';

let instance: PreviewAnimationController | null = null;

export function getPreviewAnimationController(): PreviewAnimationController {
	if (!browser) throw new Error('getPreviewAnimationController() is browser-only');
	return instance ??= new PreviewAnimationController();
}
