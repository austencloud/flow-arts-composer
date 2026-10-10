import { browser } from '$app/env';
import { SequencePersister } from './services/sequence-persister';

let instance: SequencePersister | null = null;

export function getSequencePersister(): SequencePersister {
	if (!browser) throw new Error('getSequencePersister() is browser-only');
	return instance ??= new SequencePersister();
}
