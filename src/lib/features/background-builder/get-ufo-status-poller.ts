import { browser } from '$app/env';

import { UFOStatusPoller } from './services/ufo-status-poller';

let instance: UFOStatusPoller | null = null;

export function getUFOStatusPoller(): UFOStatusPoller {
	if (!browser) throw new Error('getUFOStatusPoller() is browser-only');
	return instance ??= new UFOStatusPoller();
}
