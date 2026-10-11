import { browser } from '$app/env';

import { ModuleSelector } from './services/module-selector';

let instance: ModuleSelector | null = null;

export function getModuleSelector(): ModuleSelector {
	if (!browser) throw new Error('getModuleSelector() is browser-only');
	return instance ??= new ModuleSelector();
}
