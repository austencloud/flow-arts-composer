import type { GridMode, GridPlacement } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

/** A group of placements sharing the same grid mode */
export interface PlacementSection {
  label: string;
  gridMode: GridMode;
  placements: GridPlacement[];
}

/** Orientation option shown in a picker chip */
export interface OrientationOption {
  value: Orientation;
  label: string;
  icon: string;
  rotation?: number;
}

/** Filter group for the nav chips */
export type PlacementGroup = "all" | "tau-diamond" | "tau-box" | "terra";

/** Per-card orientation state: each card independently tracks blue + red */
export interface CardOrientations {
  left: Orientation;
  right: Orientation;
}
