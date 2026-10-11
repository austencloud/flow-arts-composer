import { browser } from '$app/env';

import { OptimizedBrowser } from './services/optimized-browser';
import { getDeviceDetector } from '#lib/shared/device/get-device-detector.js';

let instance: OptimizedBrowser | null = null;

export function getOptimizedBrowser(): OptimizedBrowser {
	if (!browser) throw new Error('getOptimizedBrowser() is browser-only');
	return instance ??= new OptimizedBrowser(getDeviceDetector());
}
