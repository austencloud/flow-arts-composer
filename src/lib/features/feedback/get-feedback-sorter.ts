import { browser } from '$app/env';
import { FeedbackSorter } from './services/feedback-sorter';

let instance: FeedbackSorter | null = null;

export function getFeedbackSorter(): FeedbackSorter {
	if (!browser) throw new Error('getFeedbackSorter() is browser-only');
	return instance ??= new FeedbackSorter();
}
