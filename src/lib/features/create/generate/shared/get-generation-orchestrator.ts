import { browser } from '$app/env';
import { GenerationOrchestrator } from '#lib/shared/create/services/generation-orchestrator.js';
import { BrowserVariationProvider } from './services/browser-variation-provider';
import { BuildResultTransformer } from './services/build-result-transformer';
import { letterQueryHandler } from '#lib/shared/pictograph/tka-glyph/services/letter-query-handler.js';
import { reversalDetector } from '#lib/shared/create/services/reversal-detector.js';
import { getSequenceMetadataManager } from './get-sequence-metadata-manager';

let instance: GenerationOrchestrator | null = null;

export function getGenerationOrchestrator(): GenerationOrchestrator {
	if (!browser) throw new Error('getGenerationOrchestrator() is browser-only');
	if (!instance) {
		const metadataManager = getSequenceMetadataManager();
		instance = new GenerationOrchestrator(
			new BrowserVariationProvider(letterQueryHandler),
			new BuildResultTransformer(metadataManager, reversalDetector),
			metadataManager
		);
	}
	return instance;
}
