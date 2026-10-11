import { browser } from '$app/env';
import { QuickAccessPersister } from './services/quick-access-persister';

let instance: QuickAccessPersister | null = null;

export function getQuickAccessPersister(): QuickAccessPersister {
	if (!browser) throw new Error('getQuickAccessPersister() is browser-only');
	return instance ??= new QuickAccessPersister();
}
