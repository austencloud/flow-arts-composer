import { browser } from '$app/env';

import { HandLandmarker } from './services/hand-landmarker';

let instance: HandLandmarker | null = null;

export function getHandLandmarker(): HandLandmarker {
	if (!browser) throw new Error('getHandLandmarker() is browser-only');
	return instance ??= new HandLandmarker();
}
