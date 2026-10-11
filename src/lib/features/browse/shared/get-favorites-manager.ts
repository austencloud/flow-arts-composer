import { browser } from '$app/env';
import { FavoritesManager } from './services/favorites-manager';

let instance: FavoritesManager | null = null;

export function getFavoritesManager(): FavoritesManager {
	if (!browser) throw new Error('getFavoritesManager() is browser-only');
	return instance ??= new FavoritesManager();
}
