import { browser } from '$app/env';
import { PresenceTracker } from './services/presence-tracker';

let instance: PresenceTracker | null = null;

export function getPresenceTracker(): PresenceTracker {
	if (!browser) throw new Error('getPresenceTracker() is browser-only');
	return instance ??= new PresenceTracker();
}
