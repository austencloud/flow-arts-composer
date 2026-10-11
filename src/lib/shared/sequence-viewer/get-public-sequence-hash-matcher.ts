import { browser } from '$app/env';
import { PublicSequenceHashMatcher } from './services/public-sequence-hash-matcher';

let instance: PublicSequenceHashMatcher | null = null;

export function getPublicSequenceHashMatcher(): PublicSequenceHashMatcher {
	if (!browser) throw new Error('getPublicSequenceHashMatcher() is browser-only');
	return instance ??= new PublicSequenceHashMatcher();
}
