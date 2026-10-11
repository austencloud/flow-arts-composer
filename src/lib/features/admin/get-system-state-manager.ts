import { browser } from '$app/env';
import { SystemStateManager } from './services/system-state-manager';

let instance: SystemStateManager | null = null;

export function getSystemStateManager(): SystemStateManager {
	if (!browser) throw new Error('getSystemStateManager() is browser-only');
	return instance ??= new SystemStateManager();
}
