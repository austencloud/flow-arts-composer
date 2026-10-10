import { reversalDetector } from '#lib/shared/create/services/reversal-detector.js';
import type { ReversalDetector } from '#lib/shared/create/services/reversal-detector.js';

export function getReversalDetector(): ReversalDetector {
	return reversalDetector;
}
