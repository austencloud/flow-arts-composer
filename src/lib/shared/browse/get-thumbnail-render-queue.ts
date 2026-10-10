import { browser } from '$app/env';
import { ThumbnailRenderQueue } from './services/thumbnail-render-queue';
import { CompositionDispatcher } from '#lib/shared/render/services/composition-dispatcher.js';

let instance: ThumbnailRenderQueue | null = null;

export function getThumbnailRenderQueue(): ThumbnailRenderQueue {
	if (!browser) throw new Error('getThumbnailRenderQueue() is browser-only');
	if (!instance) {
		instance = new ThumbnailRenderQueue();
		// Workers handle the heavy lifting — pipeline more tasks.
		// Without workers, limit to reduce main-thread pressure.
		const POOL_SIZE = Math.max(1, Math.min((navigator.hardwareConcurrency || 4) - 1, 4));
		// canUseWorker() is false until probeWorkerSupport() runs (print-preview path);
		// this queue is constructed before any probe, so it intentionally stays at the
		// conservative limit. Do not assume it scales with worker availability here.
		const max = CompositionDispatcher.canUseWorker() ? Math.min(POOL_SIZE * 2, 8) : 3;
		instance.setMaxConcurrent(max);
	}
	return instance;
}
