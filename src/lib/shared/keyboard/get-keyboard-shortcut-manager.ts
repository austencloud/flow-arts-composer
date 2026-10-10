import { browser } from '$app/env';

import { KeyboardShortcutManager } from './services/keyboard-shortcut-manager';
import { getShortcutRegistry } from './get-shortcut-registry';

let instance: KeyboardShortcutManager | null = null;

export function getKeyboardShortcutManager(): KeyboardShortcutManager {
	if (!browser) throw new Error('getKeyboardShortcutManager() is browser-only');
	return instance ??= new KeyboardShortcutManager(getShortcutRegistry());
}
