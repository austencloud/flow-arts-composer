import { browser } from '$app/environment';
import { StartPlacementManager } from '$lib/shared/create/services/start-placement-manager';

let instance: StartPlacementManager | null = null;

export function getStartPlacementManager(): StartPlacementManager {
	if (!browser) throw new Error('getStartPlacementManager() is browser-only');
	return instance ??= new StartPlacementManager();
}
