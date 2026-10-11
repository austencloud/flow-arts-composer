import { browser } from '$app/env';
import { ImageModeHandLandmarker } from './services/image-mode-hand-landmarker';

let instance: ImageModeHandLandmarker | null = null;

export function getImageModeHandLandmarker(): ImageModeHandLandmarker {
	if (!browser) throw new Error('getImageModeHandLandmarker() is browser-only');
	return instance ??= new ImageModeHandLandmarker();
}
