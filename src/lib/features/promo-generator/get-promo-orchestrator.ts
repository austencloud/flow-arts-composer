import { browser } from '$app/env';
import { PromoOrchestrator } from './services/promo-orchestrator';
import { getPromoSceneManager } from './get-promo-scene-manager';
import { getScreenshotInjector } from './get-screenshot-injector';
import { getPromoAnimationController } from './get-promo-animation-controller';
import { getPromoVideoExporter } from './get-promo-video-exporter';

let instance: PromoOrchestrator | null = null;

export function getPromoOrchestrator(): PromoOrchestrator {
	if (!browser) throw new Error('getPromoOrchestrator() is browser-only');
	return instance ??= new PromoOrchestrator(
		getPromoSceneManager(),
		getScreenshotInjector(),
		getPromoAnimationController(),
		getPromoVideoExporter(),
	);
}
