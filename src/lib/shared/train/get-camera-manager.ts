import { browser } from '$app/env';
import { CameraManager } from '#lib/shared/train/services/camera-manager.js';

let instance: CameraManager | null = null;

export function getCameraManager(): CameraManager {
	if (!browser) throw new Error('getCameraManager() is browser-only');
	return instance ??= new CameraManager();
}
