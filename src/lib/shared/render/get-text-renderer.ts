import { browser } from '$app/env';
import { TextRenderer } from './services/text-renderer';

let instance: TextRenderer | null = null;

export function getTextRenderer(): TextRenderer {
	if (!browser) throw new Error('getTextRenderer() is browser-only');
	return instance ??= new TextRenderer();
}
