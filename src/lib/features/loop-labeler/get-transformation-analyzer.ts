import { browser } from '$app/env';
import { TransformationAnalyzer } from './services/transformation-analyzer';

let instance: TransformationAnalyzer | null = null;

export function getTransformationAnalyzer(): TransformationAnalyzer {
	if (!browser) throw new Error('getTransformationAnalyzer() is browser-only');
	return instance ??= new TransformationAnalyzer();
}
