import { browser } from '$app/env';

import { UserDocumentManager } from './services/user-document-manager';

let instance: UserDocumentManager | null = null;

export function getUserDocumentManager(): UserDocumentManager {
	if (!browser) throw new Error('getUserDocumentManager() is browser-only');
	return instance ??= new UserDocumentManager();
}
