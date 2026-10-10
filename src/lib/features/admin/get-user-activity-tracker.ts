import { browser } from '$app/env';

import { UserActivityTracker } from './services/user-activity-tracker';
import { getPresenceTracker } from '#lib/shared/presence/get-presence-tracker.js';

let instance: UserActivityTracker | null = null;

export function getUserActivityTracker(): UserActivityTracker {
	if (!browser) throw new Error('getUserActivityTracker() is browser-only');
	return instance ??= new UserActivityTracker(getPresenceTracker());
}
