import { browser } from '$app/env';
import { MediaBundler } from './services/media-bundler';
import { getSharer } from './get-sharer';

let instance: MediaBundler | null = null;

export function getMediaBundler(): MediaBundler {
	if (!browser) throw new Error('getMediaBundler() is browser-only');
	return instance ??= new MediaBundler(getSharer());
}
