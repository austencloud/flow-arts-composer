import { browser } from '$app/env';
import * as feedbackFormatter from './services/feedback-formatter';

export function getFeedbackFormatter() {
	if (!browser) throw new Error('getFeedbackFormatter() is browser-only');
	return feedbackFormatter;
}
