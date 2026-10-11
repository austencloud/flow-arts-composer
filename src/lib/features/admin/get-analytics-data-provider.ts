import { browser } from '$app/env';
import { AnalyticsDataProvider } from './services/analytics-data-provider';
import { getUserMetricsAnalyzer } from './get-user-metrics-analyzer';
import { getEventActivityAnalyzer } from './get-event-activity-analyzer';

let instance: AnalyticsDataProvider | null = null;

export function getAnalyticsDataProvider(): AnalyticsDataProvider {
	if (!browser) throw new Error('getAnalyticsDataProvider() is browser-only');
	return instance ??= new AnalyticsDataProvider(
		getUserMetricsAnalyzer(),
		getEventActivityAnalyzer(),
	);
}
