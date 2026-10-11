import { browser } from '$app/env';

import { CosmicLabController } from './services/cosmic-lab-controller';

let instance: CosmicLabController | null = null;

export function getCosmicLabController(): CosmicLabController {
	if (!browser) throw new Error('getCosmicLabController() is browser-only');
	return instance ??= new CosmicLabController();
}
