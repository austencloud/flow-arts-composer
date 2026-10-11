import { browser } from '$app/env';

import { EffectPointsPersister } from './services/effect-points-persister';

let instance: EffectPointsPersister | null = null;

export function getEffectPointsPersister(): EffectPointsPersister {
	if (!browser) throw new Error('getEffectPointsPersister() is browser-only');
	if (!instance) {
		instance = new EffectPointsPersister();
		instance.load();
	}
	return instance;
}
