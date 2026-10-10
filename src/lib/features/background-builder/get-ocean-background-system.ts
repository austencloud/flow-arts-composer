import { browser } from '$app/env';
import { OceanBackgroundOrchestrator } from '@austencloud/backgrounds';

let instance: OceanBackgroundOrchestrator | null = null;

export function getOceanBackgroundSystem(): OceanBackgroundOrchestrator {
	if (!browser) throw new Error('getOceanBackgroundSystem() is browser-only');
	return instance ??= OceanBackgroundOrchestrator.create();
}
