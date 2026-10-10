import { browser } from '$app/env';
import { StepComparisonOrchestrator } from './services/comparison/step-comparison-orchestrator';

let instance: StepComparisonOrchestrator | null = null;

export function getStepComparisonOrchestrator(): StepComparisonOrchestrator {
	if (!browser) throw new Error('getStepComparisonOrchestrator() is browser-only');
	return instance ??= new StepComparisonOrchestrator();
}
