/**
 * Grid Merge Animation Constants
 * Geometry values match static/images/grid/diamond_grid.svg
 */


export const GRID = {
	SIZE: 950,
	CENTER: 475,
	OUTER_RADIUS: 300,
	HAND_RADIUS: 143.1,
	POINT_RADIUS: 25,
	HAND_POINT_RADIUS: 8,
	CENTER_POINT_RADIUS: 12,
	LABEL_OFFSET: 110,
	INTERCARDINAL_LABEL_OFFSET: 120
} as const;

// TIMING - Unified for smooth synchronized animations

export const TIMING = {
	/** Main transition duration for all phase changes */
	MERGE: 700,
	/** Point entrance pop-in duration */
	ENTRANCE: 500,
	/** Label fade/scale duration */
	LABEL: 400,
	/** Stagger delay between sequential elements */
	STAGGER: 100,
	/** Highlight pulse duration */
	HIGHLIGHT: 500,
	/** Smooth ease-out for controlled transitions */
	EASING: 'cubic-bezier(0.33, 1, 0.68, 1)',
	/** Smoother ease-out for secondary elements (backgrounds) */
	EASING_SOFT: 'cubic-bezier(0.25, 1, 0.5, 1)'
} as const;


export const RESPONSIVE = {
	/** Desktop: horizontal split */
	DESKTOP: {
		SPLIT_OFFSET_X: 260,
		SPLIT_OFFSET_Y: 0,
		MAX_WIDTH_INTRO: 400,
		MAX_WIDTH_SPLIT: 900,
		MAX_WIDTH_MERGED: 500
	},
	/** Tablet: vertical split */
	TABLET: {
		SPLIT_OFFSET_X: 0,
		SPLIT_OFFSET_Y: 200,
		MAX_WIDTH_INTRO: 320,
		MAX_WIDTH_SPLIT: 400,
		MAX_WIDTH_MERGED: 380
	},
	/** Mobile: tighter vertical split */
	MOBILE: {
		SPLIT_OFFSET_X: 0,
		SPLIT_OFFSET_Y: 180,
		MAX_WIDTH_INTRO: 280,
		MAX_WIDTH_SPLIT: 340,
		MAX_WIDTH_MERGED: 320
	}
} as const;


const { CENTER, OUTER_RADIUS, HAND_RADIUS, INTERCARDINAL_LABEL_OFFSET } = GRID;

/** Cardinal outer points (N, E, S, W) - used by both rotating and static grids */
export const CARDINAL_OUTER = [
	{ id: 'n', x: CENTER, y: CENTER - OUTER_RADIUS },
	{ id: 'e', x: CENTER + OUTER_RADIUS, y: CENTER },
	{ id: 's', x: CENTER, y: CENTER + OUTER_RADIUS },
	{ id: 'w', x: CENTER - OUTER_RADIUS, y: CENTER }
] as const;

/** Cardinal hand points - smaller points between center and outer */
export const CARDINAL_HAND = [
	{ id: 'hn', x: CENTER, y: CENTER - HAND_RADIUS },
	{ id: 'he', x: CENTER + HAND_RADIUS, y: CENTER },
	{ id: 'hs', x: CENTER, y: CENTER + HAND_RADIUS },
	{ id: 'hw', x: CENTER - HAND_RADIUS, y: CENTER }
] as const;

/** Intercardinal hand points (NE, SE, SW, NW at hand radius) - box grid */
const diagHandOffset = HAND_RADIUS * Math.cos(Math.PI / 4);
export const INTERCARDINAL_HAND = [
	{ id: 'hne', x: CENTER + diagHandOffset, y: CENTER - diagHandOffset },
	{ id: 'hse', x: CENTER + diagHandOffset, y: CENTER + diagHandOffset },
	{ id: 'hsw', x: CENTER - diagHandOffset, y: CENTER + diagHandOffset },
	{ id: 'hnw', x: CENTER - diagHandOffset, y: CENTER - diagHandOffset }
] as const;

/** Intercardinal outer points (NE, SE, SW, NW at outer radius) - box grid */
const diagOuterOffset = OUTER_RADIUS * Math.cos(Math.PI / 4);
export const INTERCARDINAL_OUTER = [
	{ id: 'ne', x: CENTER + diagOuterOffset, y: CENTER - diagOuterOffset },
	{ id: 'se', x: CENTER + diagOuterOffset, y: CENTER + diagOuterOffset },
	{ id: 'sw', x: CENTER - diagOuterOffset, y: CENTER + diagOuterOffset },
	{ id: 'nw', x: CENTER - diagOuterOffset, y: CENTER - diagOuterOffset }
] as const;

/** Cardinal direction labels (N, E, S, W) */
export const CARDINAL_LABELS = [
	{ id: 'N', x: CENTER, y: CENTER - OUTER_RADIUS - GRID.LABEL_OFFSET },
	{ id: 'E', x: CENTER + OUTER_RADIUS + GRID.LABEL_OFFSET, y: CENTER },
	{ id: 'S', x: CENTER, y: CENTER + OUTER_RADIUS + GRID.LABEL_OFFSET },
	{ id: 'W', x: CENTER - OUTER_RADIUS - GRID.LABEL_OFFSET, y: CENTER }
] as const;

/** Intercardinal direction labels (NE, SE, SW, NW) */
const diagOffset = (OUTER_RADIUS + INTERCARDINAL_LABEL_OFFSET) * Math.cos(Math.PI / 4);
export const INTERCARDINAL_LABELS = [
	{ id: 'NE', x: CENTER + diagOffset, y: CENTER - diagOffset },
	{ id: 'SE', x: CENTER + diagOffset, y: CENTER + diagOffset },
	{ id: 'SW', x: CENTER - diagOffset, y: CENTER + diagOffset },
	{ id: 'NW', x: CENTER - diagOffset, y: CENTER - diagOffset }
] as const;


/**
 * 'diamond' and 'box' are the single four-point grids a pictograph draws. They
 * let the lesson board settle from the merged grid into the grid that later
 * lessons place hands on, without swapping in a different drawing.
 */
export type Phase =
	| 'intro'
	| 'split'
	| 'diamond-labels'
	| 'box-labels'
	| 'merged'
	| 'split-highlight'
	| 'diamond'
	| 'box';

/** 'lesson' uses the theme's quiet points; 'pictograph' matches a pictograph card. */
export type BoardLook = 'lesson' | 'pictograph';
export type HighlightPhase = 'none' | 'center' | 'hand' | 'outer';
