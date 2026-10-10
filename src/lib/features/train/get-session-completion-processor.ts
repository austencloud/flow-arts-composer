import { browser } from '$app/env';

import { SessionCompletionProcessor } from './services/session-completion-processor';
import { getPerformanceHistoryTracker } from './get-performance-history-tracker';

let instance: SessionCompletionProcessor | null = null;

export function getSessionCompletionProcessor(): SessionCompletionProcessor {
	if (!browser) throw new Error('getSessionCompletionProcessor() is browser-only');
	return instance ??= new SessionCompletionProcessor(
		getPerformanceHistoryTracker(),
	);
}
