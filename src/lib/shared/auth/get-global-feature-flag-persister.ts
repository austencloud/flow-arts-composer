import { browser } from '$app/env';
import { GlobalFeatureFlagPersister } from './services/global-feature-flag-persister';

let instance: GlobalFeatureFlagPersister | null = null;

export function getGlobalFeatureFlagPersister(): GlobalFeatureFlagPersister {
	if (!browser) throw new Error('getGlobalFeatureFlagPersister() is browser-only');
	return instance ??= new GlobalFeatureFlagPersister();
}
