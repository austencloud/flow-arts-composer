import { browser } from '$app/env';
import { pictographFilter } from './services/pictograph-filter';

export function getPictographFilter(): typeof pictographFilter {
	if (!browser) throw new Error('getPictographFilter() is browser-only');
	return pictographFilter;
}
