import { browser } from '$app/env';
import { PictographKeyHasher } from './services/pictograph-key-hasher';

let instance: PictographKeyHasher | null = null;

export function getPictographKeyHasher(): PictographKeyHasher {
	if (!browser) throw new Error('getPictographKeyHasher() is browser-only');
	return instance ??= new PictographKeyHasher();
}
