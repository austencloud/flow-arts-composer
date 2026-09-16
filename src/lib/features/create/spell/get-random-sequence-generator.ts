import { browser } from '$app/environment';

import { RandomSequenceGenerator } from './services/random-sequence-generator';
import * as loopEndPlacementResolver from './services/loop-end-placement-resolver';
import { letterQueryHandler } from '$lib/shared/pictograph/tka-glyph/services/letter-query-handler';
import { getStartPlacementValidator } from './get-start-placement-validator';
import * as orientationContinuityValidator from './services/orientation-continuity-validator';
import { getSequenceExtender } from '$lib/features/create/shared/get-sequence-extender';
import { getStepConverter } from '$lib/features/create/generate/shared/get-step-converter';
import { reversalDetector } from '$lib/shared/create/services/reversal-detector';

let instance: RandomSequenceGenerator | null = null;

export function getRandomSequenceGenerator(): RandomSequenceGenerator {
	if (!browser) throw new Error('getRandomSequenceGenerator() is browser-only');
	return instance ??= new RandomSequenceGenerator(
		letterQueryHandler,
		getStartPlacementValidator(),
		orientationContinuityValidator,
		getSequenceExtender(),
		getStepConverter(),
		reversalDetector,
		loopEndPlacementResolver
	);
}
