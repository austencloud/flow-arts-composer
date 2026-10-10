import { browser } from '$app/env';
import { ShortcutRegistry } from './services/shortcut-registry';

let instance: ShortcutRegistry | null = null;

export function getShortcutRegistry(): ShortcutRegistry {
	if (!browser) throw new Error('getShortcutRegistry() is browser-only');
	return instance ??= new ShortcutRegistry();
}
