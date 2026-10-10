import { browser } from '$app/env';
import { SequenceImageSharer } from './services/sequence-image-sharer';
import { getSequenceRenderer } from '#lib/shared/render/get-sequence-renderer.js';

let instance: SequenceImageSharer | null = null;

export function getSequenceImageSharer(): SequenceImageSharer {
	if (!browser) throw new Error('getSequenceImageSharer() is browser-only');
	return instance ??= new SequenceImageSharer(getSequenceRenderer());
}
