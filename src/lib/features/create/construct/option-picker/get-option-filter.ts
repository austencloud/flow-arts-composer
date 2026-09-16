import { browser } from '$app/environment';
import { OptionFilter } from './services/option-filter';
import { getPlacementAnalyzer } from './get-placement-analyzer';

let instance: OptionFilter | null = null;

export function getOptionFilter(): OptionFilter {
	if (!browser) throw new Error('getOptionFilter() is browser-only');
	return instance ??= new OptionFilter(getPlacementAnalyzer());
}
