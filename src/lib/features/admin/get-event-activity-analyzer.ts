import { browser } from '$app/env';
import { EventActivityAnalyzer } from './services/event-activity-analyzer';

let instance: EventActivityAnalyzer | null = null;

export function getEventActivityAnalyzer(): EventActivityAnalyzer {
	if (!browser) throw new Error('getEventActivityAnalyzer() is browser-only');
	return instance ??= new EventActivityAnalyzer();
}
