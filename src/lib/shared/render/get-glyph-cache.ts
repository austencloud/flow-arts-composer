import { browser } from '$app/env';
import { GlyphCache } from './services/glyph-cache';

let instance: GlyphCache | null = null;

export function getGlyphCache(): GlyphCache {
	if (!browser) throw new Error('getGlyphCache() is browser-only');
	return instance ??= new GlyphCache();
}
