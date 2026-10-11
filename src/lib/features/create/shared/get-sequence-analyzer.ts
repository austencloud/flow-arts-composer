import { browser } from '$app/env';

import { SequenceAnalyzer } from './services/sequence-analyzer';
import { betaDetector } from '#lib/shared/pictograph/prop/services/beta-detector.js';

let instance: SequenceAnalyzer | null = null;

export function getSequenceAnalyzer(): SequenceAnalyzer {
	if (!browser) throw new Error('getSequenceAnalyzer() is browser-only');
	return instance ??= new SequenceAnalyzer(betaDetector);
}
