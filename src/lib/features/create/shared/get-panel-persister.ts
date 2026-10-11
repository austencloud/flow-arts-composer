import { browser } from '$app/env';

import { PanelPersister } from './services/panel-persister.svelte';

let instance: PanelPersister | null = null;

export function getPanelPersister(): PanelPersister {
	if (!browser) throw new Error('getPanelPersister() is browser-only');
	return instance ??= new PanelPersister();
}
