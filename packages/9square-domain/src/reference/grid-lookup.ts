/**
 * Grid Position Lookup
 *
 * Functions for finding and listing positions in the 9-Square grid.
 */

import type { GridPlacement } from "../data/grid.js";
import { NINE_SQUARE_POSITIONS } from "../data/grid.js";

export function getGridPlacement(id: string): GridPlacement | undefined {
	// TODO: Implement lookup once grid data is populated
	return NINE_SQUARE_POSITIONS.find((p) => p.id === id);
}

export function listGridPlacements(mode?: "diamond" | "box"): GridPlacement[] {
	// TODO: Implement filtering once grid data is populated
	if (!mode) return NINE_SQUARE_POSITIONS;
	return NINE_SQUARE_POSITIONS.filter(
		(p) => p.mode === mode || p.mode === "both",
	);
}
