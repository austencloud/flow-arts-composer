import { browser } from '$app/env';
import { SequenceFeatureExtractor } from './services/sequence-feature-extractor';
import { getSequenceAnalyzer } from '#lib/features/create/shared/get-sequence-analyzer.js';

let instance: SequenceFeatureExtractor | null = null;

export function getSequenceFeatureExtractor(): SequenceFeatureExtractor {
	if (!browser) throw new Error('getSequenceFeatureExtractor() is browser-only');
	return instance ??= new SequenceFeatureExtractor(getSequenceAnalyzer());
}
