import { browser } from '$app/env';

import { PostHogUserAnalytics } from './services/post-hog-user-analytics';

let instance: PostHogUserAnalytics | null = null;

export function getPostHogUserAnalytics(): PostHogUserAnalytics {
	if (!browser) throw new Error('getPostHogUserAnalytics() is browser-only');
	return instance ??= new PostHogUserAnalytics();
}
