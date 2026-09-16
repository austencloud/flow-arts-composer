import { browser } from '$app/environment';

import { PlacementAnalyzer } from './services/placement-analyzer';

let instance: PlacementAnalyzer | null = null;

export function getPlacementAnalyzer(): PlacementAnalyzer {
	if (!browser) throw new Error('getPlacementAnalyzer() is browser-only');
	return instance ??= new PlacementAnalyzer();
}
