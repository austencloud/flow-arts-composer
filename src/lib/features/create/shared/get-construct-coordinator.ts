import { browser } from '$app/env';

import { ConstructCoordinator } from './services/construct-coordinator';

let instance: ConstructCoordinator | null = null;

export function getConstructCoordinator(): ConstructCoordinator {
	if (!browser) throw new Error('getConstructCoordinator() is browser-only');
	return instance ??= new ConstructCoordinator();
}
