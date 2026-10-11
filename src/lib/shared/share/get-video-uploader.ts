import { browser } from '$app/env';
import { R2VideoUploader } from './services/r2-video-uploader';

let instance: R2VideoUploader | null = null;

export function getVideoUploader(): R2VideoUploader {
	if (!browser) throw new Error('getVideoUploader() is browser-only');
	return instance ??= new R2VideoUploader();
}
