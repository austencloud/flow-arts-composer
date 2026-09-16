import { browser } from '$app/environment';
import { StartPlacementValidator } from './services/start-placement-validator';
import { getLetterTransitionGraph } from './get-letter-transition-graph';
import { letterQueryHandler } from '$lib/shared/pictograph/tka-glyph/services/letter-query-handler';

let instance: StartPlacementValidator | null = null;

export function getStartPlacementValidator(): StartPlacementValidator {
	if (!browser) throw new Error('getStartPlacementValidator() is browser-only');
	return instance ??= new StartPlacementValidator(getLetterTransitionGraph(), letterQueryHandler);
}
