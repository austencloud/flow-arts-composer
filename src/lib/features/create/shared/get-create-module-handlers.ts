import { browser } from '$app/env';

import { CreateModuleHandlers } from './services/create-module-handlers';
import { getCreateModuleOrchestrator } from './get-create-module-orchestrator';
import { getStepOperator } from './get-step-operator';

let instance: CreateModuleHandlers | null = null;

export function getCreateModuleHandlers(): CreateModuleHandlers {
	if (!browser) throw new Error('getCreateModuleHandlers() is browser-only');
	return instance ??= new CreateModuleHandlers(getCreateModuleOrchestrator(), getStepOperator());
}
