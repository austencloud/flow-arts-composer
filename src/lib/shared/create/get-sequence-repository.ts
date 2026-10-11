import { browser } from '$app/env';
import { SequenceRepository } from './services/sequence-repository';
import { getSequenceDomainManager } from '#lib/shared/create/get-sequence-domain-manager.js';
import { getReversalDetector } from '#lib/shared/create/get-reversal-detector.js';
import { sequenceImporter } from '#lib/shared/create/services/sequence-importer.js';

let instance: SequenceRepository | null = null;

export function getSequenceRepository(): SequenceRepository {
	if (!browser) throw new Error('getSequenceRepository() is browser-only');
	return instance ??= new SequenceRepository(
		getSequenceDomainManager(),
		getReversalDetector(),
		sequenceImporter,
	);
}
