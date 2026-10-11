import { browser } from '$app/env';

import { MediaPipeDetector } from './services/media-pipe-detector';
import { getHandLandmarker } from './get-hand-landmarker';
import { getHandTrackingStabilizer } from './get-hand-tracking-stabilizer';

let instance: MediaPipeDetector | null = null;

export function getPositionDetector(): MediaPipeDetector {
	if (!browser) throw new Error('getPositionDetector() is browser-only');
	return instance ??= new MediaPipeDetector(
		getHandLandmarker(),
		getHandTrackingStabilizer(),
	);
}
