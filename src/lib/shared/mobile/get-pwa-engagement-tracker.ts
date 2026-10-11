import { browser } from '$app/env';
import { PWAEngagementTracker } from './services/pwa-engagement-tracker';

let instance: PWAEngagementTracker | null = null;

export function getPWAEngagementTracker(): PWAEngagementTracker {
	if (!browser) throw new Error('getPWAEngagementTracker() is browser-only');
	return instance ??= new PWAEngagementTracker();
}
