import { browser } from '$app/env';
import { Workbench } from './services/workbench';
import { getSequenceRepository } from '#lib/shared/create/get-sequence-repository.js';

let instance: Workbench | null = null;

export function getWorkbench(): Workbench {
	if (!browser) throw new Error('getWorkbench() is browser-only');
	return instance ??= new Workbench(getSequenceRepository());
}
