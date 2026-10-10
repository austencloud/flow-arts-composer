import { browser } from '$app/env';
import { StepOperator } from './services/step-operator';
import { motionQueryHandler } from '#lib/shared/pictograph/shared/services/motion-query-handler.js';

let instance: StepOperator | null = null;

export function getStepOperator(): StepOperator {
	if (!browser) throw new Error('getStepOperator() is browser-only');
	return instance ??= new StepOperator(motionQueryHandler);
}
