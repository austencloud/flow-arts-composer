import { browser } from '$app/env';

import { SvgImageConverter } from './services/svg-image-converter';

let instance: SvgImageConverter | null = null;

export function getSvgImageConverter(): SvgImageConverter {
	if (!browser) throw new Error('getSvgImageConverter() is browser-only');
	return instance ??= new SvgImageConverter();
}
