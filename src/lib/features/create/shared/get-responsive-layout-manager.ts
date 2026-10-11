import { browser } from '$app/env';
import { ResponsiveLayoutManager } from '#lib/shared/create/services/responsive-layout-manager.js';
import { getDeviceDetector } from '#lib/shared/device/get-device-detector.js';
import { getViewportManager } from '#lib/shared/device/get-viewport-manager.js';

let instance: ResponsiveLayoutManager | null = null;

export function getResponsiveLayoutManager(): ResponsiveLayoutManager {
	if (!browser) throw new Error('getResponsiveLayoutManager() is browser-only');
	return instance ??= new ResponsiveLayoutManager(getDeviceDetector(), getViewportManager());
}
