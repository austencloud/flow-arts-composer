/**
 * Grid Hit Target Calculator
 *
 * Converts grid coordinate data into clickable hit target positions.
 * Uses the canonical gridCoordinates.ts hand_points for SVG pixel positions.
 *
 * The SVG canvas is 950x950. Hand points define where props sit.
 * Hit targets are rendered as transparent circles at these coordinates.
 */

import {
	GridLocation,
	GridMode,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { GridHitTarget } from "#lib/shared/assemble-lab/domain/types.js";

/** Parse "(x, y)" string format from gridCoordinates into numbers */
function parseCoord(coordString: string): { x: number; y: number } {
	const cleaned = coordString.replace(/[()]/g, "");
	const [xStr, yStr] = cleaned.split(",").map((s) => s.trim());
	return { x: parseFloat(xStr!), y: parseFloat(yStr!) };
}

/** SVG-unit radius for hit targets. At typical render sizes, this maps to ~64px (WCAG AAA). */
const HIT_TARGET_RADIUS = 60;

const DIAMOND_TARGETS: GridHitTarget[] = [
	{ location: GridLocation.NORTH, ...parseCoord("(475.0, 331.9)"), label: "North" },
	{ location: GridLocation.EAST, ...parseCoord("(618.1, 475.0)"), label: "East" },
	{ location: GridLocation.SOUTH, ...parseCoord("(475.0, 618.1)"), label: "South" },
	{ location: GridLocation.WEST, ...parseCoord("(331.9, 475.0)"), label: "West" },
];

const BOX_TARGETS: GridHitTarget[] = [
	{ location: GridLocation.NORTHEAST, ...parseCoord("(576.2, 373.8)"), label: "Northeast" },
	{ location: GridLocation.SOUTHEAST, ...parseCoord("(576.2, 576.2)"), label: "Southeast" },
	{ location: GridLocation.SOUTHWEST, ...parseCoord("(373.8, 576.2)"), label: "Southwest" },
	{ location: GridLocation.NORTHWEST, ...parseCoord("(373.8, 373.8)"), label: "Northwest" },
];

// Skewed = all 8 cardinal + intercardinal points (diamond hand_points + box hand_points)
const SKEWED_TARGETS: GridHitTarget[] = [
	...DIAMOND_TARGETS,
	...BOX_TARGETS,
];

const CENTER_TARGET: GridHitTarget = {
	location: GridLocation.CENTER, x: 475, y: 475, label: "Center"
};

export function getHitTargets(gridMode: GridMode, showCenter: boolean = false): GridHitTarget[] {
	let targets: GridHitTarget[];
	switch (gridMode) {
		case GridMode.DIAMOND:
			targets = DIAMOND_TARGETS;
			break;
		case GridMode.BOX:
			targets = BOX_TARGETS;
			break;
		case GridMode.SKEWED:
			targets = SKEWED_TARGETS;
			break;
		default:
			targets = DIAMOND_TARGETS;
	}
	return showCenter ? [...targets, CENTER_TARGET] : targets;
}

export function getHitTargetRadius(): number {
	return HIT_TARGET_RADIUS;
}
