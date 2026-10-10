import { browser } from '$app/env';

import { FormDraftPersister } from './services/form-draft-persister.svelte';

let instance: FormDraftPersister | null = null;

export function getFormDraftPersister(): FormDraftPersister {
	if (!browser) throw new Error('getFormDraftPersister() is browser-only');
	return instance ??= new FormDraftPersister();
}
