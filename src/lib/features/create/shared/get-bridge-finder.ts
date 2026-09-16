import { browser } from '$app/environment';
import { BridgeFinder } from './services/bridge-finder';
import { letterQueryHandler } from '$lib/shared/pictograph/tka-glyph/services/letter-query-handler';
import { getPlacementAnalyzer } from '$lib/features/create/construct/option-picker/get-placement-analyzer';
import { getLOOPValidator } from './get-loop-validator';
import { getSequenceAnalyzer } from './get-sequence-analyzer';
import { getOrientationAlignmentCalculator } from './get-orientation-alignment-calculator';

let instance: BridgeFinder | null = null;

export function getBridgeFinder(): BridgeFinder {
	if (!browser) throw new Error('getBridgeFinder() is browser-only');
	return instance ??= new BridgeFinder(
		letterQueryHandler,
		getPlacementAnalyzer(),
		getLOOPValidator(),
		getSequenceAnalyzer(),
		getOrientationAlignmentCalculator()
	);
}
