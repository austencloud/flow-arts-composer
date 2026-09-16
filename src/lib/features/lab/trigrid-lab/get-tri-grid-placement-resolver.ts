import { browser } from '$app/environment';
import type { GridLocation } from '$lib/shared/pictograph/grid/domain/enums/grid-enums';
import type { TriGridMode, TriGridPlacementInfo } from './domain/trigrid-types';
import { resolveTriGridPlacement } from './domain/trigrid-placements';

/**
 * Browser-only accessor for trigrid placement classification.
 *
 * Delegates directly to the domain resolver (same vertex = beta, different
 * vertices = gamma; no alpha on a 3-point grid). The previous passthrough
 * service shim was removed — this factory is the only browser guard needed.
 */
export function getTriGridPlacementResolver(): {
	resolvePlacement: (
		leftLocation: GridLocation,
		rightLocation: GridLocation,
		mode: TriGridMode,
	) => TriGridPlacementInfo | null;
} {
	if (!browser) throw new Error('getTriGridPlacementResolver() is browser-only');
	return { resolvePlacement: resolveTriGridPlacement };
}
