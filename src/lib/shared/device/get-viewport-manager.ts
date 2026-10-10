import { viewportManager } from './services/viewport-manager.svelte';
import type { ViewportManager } from '#lib/shared/device/services/viewport-manager.svelte.js'

/** Returns the module-level ViewportManager singleton. */
export function getViewportManager(): ViewportManager {
	return viewportManager;
}
