import { browser } from '$app/env';
import { ShortcutCustomizer } from './services/shortcut-customizer';
import { getShortcutRegistry } from './get-shortcut-registry';

let instance: ShortcutCustomizer | null = null;

export function getShortcutCustomizer(): ShortcutCustomizer {
	if (!browser) throw new Error('getShortcutCustomizer() is browser-only');
	return instance ??= new ShortcutCustomizer(getShortcutRegistry());
}
