import { browser } from '$app/env';

import { OptionTransitionCoordinator } from './services/option-transition-coordinator';

let instance: OptionTransitionCoordinator | null = null;

export function getOptionTransitionCoordinator(): OptionTransitionCoordinator {
	if (!browser) throw new Error('getOptionTransitionCoordinator() is browser-only');
	return instance ??= new OptionTransitionCoordinator();
}
