import { browser } from '$app/env';
import { CreateModuleOrchestrator } from './services/create-module-orchestrator';

let instance: CreateModuleOrchestrator | null = null;

export function getCreateModuleOrchestrator(): CreateModuleOrchestrator {
	if (!browser) throw new Error('getCreateModuleOrchestrator() is browser-only');
	return instance ??= new CreateModuleOrchestrator();
}
