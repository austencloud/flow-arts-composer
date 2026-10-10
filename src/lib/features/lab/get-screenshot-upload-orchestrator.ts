import { browser } from '$app/env';

import { ScreenshotUploadOrchestrator } from './services/screenshot-upload-orchestrator';
import { uploadScreenshot } from './services/screenshot-uploader';
import * as screenshotOrchestrator from './services/screenshot-orchestrator';
import * as screenshotLoader from './services/screenshot-loader';

let instance: ScreenshotUploadOrchestrator | null = null;

export function getScreenshotUploadOrchestrator(): ScreenshotUploadOrchestrator {
	if (!browser) throw new Error('getScreenshotUploadOrchestrator() is browser-only');
	return instance ??= new ScreenshotUploadOrchestrator(
		{ upload: uploadScreenshot },
		{
			getDeviceBySlug: screenshotOrchestrator.getDeviceBySlug,
			getRoutes: screenshotOrchestrator.getRoutes,
		},
		{
			loadAll: screenshotLoader.loadAllScreenshots,
		},
	);
}
