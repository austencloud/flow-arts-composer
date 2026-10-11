import { browser } from '$app/env';
import * as performanceHistoryTracker from './services/performance-history-tracker';

export function getPerformanceHistoryTracker() {
	if (!browser) throw new Error('getPerformanceHistoryTracker() is browser-only');
	return performanceHistoryTracker;
}
