import { browser } from '$app/env';
import { PWAInstallDismissalManager } from './services/pwa-install-dismissal-manager';

let instance: PWAInstallDismissalManager | null = null;

export function getPWAInstallDismissalManager(): PWAInstallDismissalManager {
	if (!browser) throw new Error('getPWAInstallDismissalManager() is browser-only');
	return instance ??= new PWAInstallDismissalManager();
}
