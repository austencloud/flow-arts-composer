import { browser } from '$app/env';
import { Phase1OverlayRenderer } from './services/phase1-overlay-renderer';

let instance: Phase1OverlayRenderer | null = null;

export function getPhase1OverlayRenderer(): Phase1OverlayRenderer {
	if (!browser) throw new Error('getPhase1OverlayRenderer() is browser-only');
	return instance ??= new Phase1OverlayRenderer();
}
