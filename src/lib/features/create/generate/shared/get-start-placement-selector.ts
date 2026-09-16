import { browser } from '$app/environment';
import { StartPlacementSelector } from './services/start-placement-selector';
import { letterQueryHandler } from '$lib/shared/pictograph/tka-glyph/services/letter-query-handler';
import { getPictographFilter } from './get-pictograph-filter';
import { getStepConverter } from './get-step-converter';

let instance: StartPlacementSelector | null = null;

export function getStartPlacementSelector(): StartPlacementSelector {
	if (!browser) throw new Error('getStartPlacementSelector() is browser-only');
	return instance ??= new StartPlacementSelector(
		letterQueryHandler,
		getPictographFilter(),
		getStepConverter()
	);
}
