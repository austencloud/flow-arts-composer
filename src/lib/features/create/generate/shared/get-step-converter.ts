import { browser } from '$app/env';
import { stepConverter } from './services/step-converter';

export function getStepConverter(): typeof stepConverter {
	if (!browser) throw new Error('getStepConverter() is browser-only');
	return stepConverter;
}
