import { browser } from '$app/env';
import { UserFeatureFlagPersister } from './services/user-feature-flag-persister';

let instance: UserFeatureFlagPersister | null = null;

export function getUserFeatureFlagPersister(): UserFeatureFlagPersister {
	if (!browser) throw new Error('getUserFeatureFlagPersister() is browser-only');
	return instance ??= new UserFeatureFlagPersister();
}
