import { browser } from '$app/env';

import { KeyboardNavigator } from './services/keyboard-navigator';

let instance: KeyboardNavigator | null = null;

export function getKeyboardNavigator(): KeyboardNavigator {
	if (!browser) throw new Error('getKeyboardNavigator() is browser-only');
	return instance ??= new KeyboardNavigator();
}
