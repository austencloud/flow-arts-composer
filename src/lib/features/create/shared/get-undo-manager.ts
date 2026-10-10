import { browser } from '$app/env';

import { UndoManager } from './services/undo-manager';

let instance: UndoManager | null = null;

export function getUndoManager(): UndoManager {
	if (!browser) throw new Error('getUndoManager() is browser-only');
	return instance ??= new UndoManager();
}
