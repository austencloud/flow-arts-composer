import { browser } from '$app/env';
import { ImageFormatConverter } from './services/image-format-converter';

let instance: ImageFormatConverter | null = null;

export function getImageFormatConverter(): ImageFormatConverter {
	if (!browser) throw new Error('getImageFormatConverter() is browser-only');
	return instance ??= new ImageFormatConverter();
}
