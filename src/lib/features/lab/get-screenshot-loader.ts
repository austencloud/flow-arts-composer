import { browser } from '$app/env';

import * as screenshotLoader from './services/screenshot-loader';

export function getScreenshotLoader() {
	if (!browser) throw new Error('getScreenshotLoader() is browser-only');
	return screenshotLoader;
}
