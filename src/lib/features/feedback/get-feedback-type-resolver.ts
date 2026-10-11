import { browser } from '$app/env';
import * as feedbackTypeResolver from './services/feedback-type-resolver';

export function getFeedbackTypeResolver() {
	if (!browser) throw new Error('getFeedbackTypeResolver() is browser-only');
	return feedbackTypeResolver;
}
