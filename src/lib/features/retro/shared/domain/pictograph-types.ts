/**
 * Shared pictograph data model for all retro eras.
 *
 * Uses the real TKA domain types - every era has full notation capability.
 * Each era implements its own RENDERER for this data (ASCII, pixel art, vector, etc.).
 */

import { GridLocation, GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
	MotionType,
	Orientation,
	HandSide,
	RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { Letter } from "#lib/shared/foundation/domain/models/letter.js";

// Re-export for convenience - consumers can import from here
export { GridLocation, GridMode, MotionType, Orientation, HandSide, RotationDirection };
export type { Letter };

/** One hand's state within a pictograph */
export interface RetroHandData {
	readonly color: HandSide;
	readonly location: GridLocation;
	readonly orientation: Orientation;
	readonly motionType: MotionType;
	readonly endLocation: GridLocation;
	readonly turns: number;
	readonly rotationDirection: RotationDirection;
}

/** Complete pictograph: two hands on a grid */
export interface RetroPictographData {
	readonly letter: Letter | string;
	readonly leftHand: RetroHandData;
	readonly rightHand: RetroHandData;
	readonly gridMode: GridMode;
	readonly isBridge?: boolean;
}
