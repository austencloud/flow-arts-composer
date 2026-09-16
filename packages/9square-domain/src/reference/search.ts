/**
 * 9-Square / QFT Search
 *
 * Full-text search across 9-Square and QFT domain data: grid positions,
 * QFT formulas, transitions, glossary terms, and contributors.
 */

import type { GridPlacement } from "../data/grid.js";
import type { QFTFormula } from "../data/qft-notation.js";
import type { GridTransition } from "../data/transitions.js";
import type { FlowArtsGlossaryEntry } from "@flow-arts/core";

export type NineSquareSearchResultType =
	| "grid-placement"
	| "qft-formula"
	| "transition"
	| "glossary";

export interface NineSquareSearchResult {
	/** What kind of result this is */
	type: NineSquareSearchResultType;
	/** Matched item ID */
	id: string;
	/** Display name */
	name: string;
	/** Short description or definition */
	summary: string;
	/** The underlying data object */
	data: GridPlacement | QFTFormula | GridTransition | FlowArtsGlossaryEntry;
}

export function searchNineSquare(query: string): NineSquareSearchResult[] {
	// TODO: Implement search once data files are populated
	void query;
	return [];
}
