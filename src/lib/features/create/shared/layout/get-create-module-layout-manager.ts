import { browser } from '$app/env';
import { CreateModuleLayoutManager } from './services/create-module-layout-manager';
import { getDeviceDetector } from '#lib/shared/device/get-device-detector.js';
import { getViewportManager } from '#lib/shared/device/get-viewport-manager.js';

let instance: CreateModuleLayoutManager | null = null;

export function getCreateModuleLayoutManager(): CreateModuleLayoutManager {
	if (!browser) throw new Error('getCreateModuleLayoutManager() is browser-only');
	return instance ??= new CreateModuleLayoutManager(getDeviceDetector(), getViewportManager());
}
