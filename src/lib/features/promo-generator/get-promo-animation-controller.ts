import { browser } from '$app/env';
import { PromoAnimationController } from './services/promo-animation-controller';

let instance: PromoAnimationController | null = null;

export function getPromoAnimationController(): PromoAnimationController {
	if (!browser) throw new Error('getPromoAnimationController() is browser-only');
	return instance ??= new PromoAnimationController();
}
