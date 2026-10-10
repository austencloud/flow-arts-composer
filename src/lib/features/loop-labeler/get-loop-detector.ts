import { browser } from '$app/env';
import type { ILOOPDetector } from './services/ILOOPDetector';
import { LOOPDetector } from './services/loop-detector';
import { getStepComparisonOrchestrator } from './get-step-comparison-orchestrator';
import { getTransformationAnalyzer } from './get-transformation-analyzer';
import * as polyrhythmicDetectorModule from './services/polyrhythmic-detector';
import * as layeredPathDetectorModule from './services/layered-path-detector';

let instance: ILOOPDetector | null = null;

export function getLOOPDetector(): ILOOPDetector {
	if (!browser) throw new Error('getLOOPDetector() is browser-only');
	return instance ??= new LOOPDetector(
		getStepComparisonOrchestrator(),
		getTransformationAnalyzer(),
		polyrhythmicDetectorModule,
		layeredPathDetectorModule,
	);
}
