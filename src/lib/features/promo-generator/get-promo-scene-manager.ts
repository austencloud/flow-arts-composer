import { browser } from '$app/env';
import { PromoSceneManager } from './services/promo-scene-manager';

let instance: PromoSceneManager | null = null;

export function getPromoSceneManager(): PromoSceneManager {
	if (!browser) throw new Error('getPromoSceneManager() is browser-only');
	return instance ??= new PromoSceneManager();
}
