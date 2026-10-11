import { browser } from '$app/env';

import { PostHogAnalyticsProvider } from './services/post-hog-analytics-provider';

let instance: PostHogAnalyticsProvider | null = null;

export function getPostHogAnalyticsProvider(): PostHogAnalyticsProvider {
	if (!browser) throw new Error('getPostHogAnalyticsProvider() is browser-only');
	return instance ??= new PostHogAnalyticsProvider();
}
