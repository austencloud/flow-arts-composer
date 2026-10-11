import { browser } from '$app/env';

import { MobileFullscreenManager } from './services/mobile-fullscreen-manager';

let instance: MobileFullscreenManager | null = null;

export function getMobileFullscreenManager(): MobileFullscreenManager {
	if (!browser) throw new Error('getMobileFullscreenManager() is browser-only');
	return instance ??= new MobileFullscreenManager();
}
