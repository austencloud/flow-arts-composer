import { browser } from '$app/env';

import { NavigationSyncer } from './services/navigation-syncer';

let instance: NavigationSyncer | null = null;

export function getNavigationSyncer(): NavigationSyncer {
	if (!browser) throw new Error('getNavigationSyncer() is browser-only');
	return instance ??= new NavigationSyncer();
}
