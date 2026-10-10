import { browser } from '$app/env';
import { ScreenshotInjector } from './services/screenshot-injector';

let instance: ScreenshotInjector | null = null;

export function getScreenshotInjector(): ScreenshotInjector {
	if (!browser) throw new Error('getScreenshotInjector() is browser-only');
	return instance ??= new ScreenshotInjector();
}
