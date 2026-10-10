import { browser } from '$app/env';

import { variationExplorationOrchestrator } from './services/variation-exploration-orchestrator';

export function getVariationExplorationOrchestrator() {
	if (!browser) throw new Error('getVariationExplorationOrchestrator() is browser-only');
	return variationExplorationOrchestrator;
}
