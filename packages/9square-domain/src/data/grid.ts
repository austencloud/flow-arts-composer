/**
 * 9-Square Spatial Grid
 *
 * Charlie Cushing's 9-Square Theory quantizes poi space into a grid around the body.
 * Positions have origins, destinations, and purposes. The grid enables finding
 * transitions between movements, switching between diamond and box mode via
 * soft transitions, and creating algorithms for changing timing/direction
 * through CAPs and polyrhythm hybrids.
 *
 * Recommended poi length: 1/2 arm length for optimal 9-square patterns.
 */

import type { SourcedClaim } from "@flow-arts/core";

/** A named position within the 9-square grid */
export interface GridPlacement {
	/** Unique identifier for this position */
	id: string;
	/** Display name */
	name: string;
	/** Grid coordinates (row, column) within the 3x3 matrix */
	row: number;
	column: number;
	/** Purpose of this position in movement context */
	purpose: string;
	/** Whether this position serves as an origin, destination, or both */
	role: "origin" | "destination" | "both";
	/** Which grid mode this position belongs to */
	mode: "diamond" | "box" | "both";
	/** Where this position definition comes from */
	source: SourcedClaim;
}

/** Grid mode (diamond vs box) and how to switch between them */
export type GridMode = "diamond" | "box";

/** The complete 9-square grid definition */
export interface NineSquareGrid {
	/** All positions in the grid */
	positions: GridPlacement[];
	/** Available grid modes */
	modes: GridMode[];
	/** How diamond and box modes relate via soft transitions */
	modeTransitionDescription: string;
	/** Recommended poi length for optimal grid patterns */
	recommendedPoiLength: string;
	/** Where this grid definition comes from */
	source: SourcedClaim;
}

// TODO: Populate grid positions from Charlie Cushing's 9-Square Theory video series
export const NINE_SQUARE_POSITIONS: GridPlacement[] = [];

// TODO: Populate with full grid definition including mode descriptions
export const NINE_SQUARE_GRID: NineSquareGrid = {
	positions: NINE_SQUARE_POSITIONS,
	modes: ["diamond", "box"],
	modeTransitionDescription: "",
	recommendedPoiLength: "1/2 arm length",
	source: {
		claim: "9-Square Theory quantizes poi space into a spatial grid around the body",
		sourceType: "document",
		sourceRef: "Charlie Cushing, 9-Square Theory video series",
	},
};
