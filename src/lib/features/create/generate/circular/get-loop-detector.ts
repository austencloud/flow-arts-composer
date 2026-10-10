import { browser } from '$app/env';
import type { ILOOPDetector } from '#lib/shared/create/services/ILOOPDetector.js';
import { LOOPDetector } from './services/loop-detector';

let instance: ILOOPDetector | null = null;

export function getLOOPDetector(): ILOOPDetector {
	if (!browser) throw new Error('getLOOPDetector() is browser-only');
	return instance ??= new LOOPDetector();
}
