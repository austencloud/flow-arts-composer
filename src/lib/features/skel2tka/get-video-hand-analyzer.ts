import { browser } from '$app/env';
import { VideoHandAnalyzer } from './services/video-hand-analyzer';
import { getImageModeHandLandmarker } from './get-image-mode-hand-landmarker';

let instance: VideoHandAnalyzer | null = null;

export function getVideoHandAnalyzer(): VideoHandAnalyzer {
	if (!browser) throw new Error('getVideoHandAnalyzer() is browser-only');
	return instance ??= new VideoHandAnalyzer(getImageModeHandLandmarker());
}
