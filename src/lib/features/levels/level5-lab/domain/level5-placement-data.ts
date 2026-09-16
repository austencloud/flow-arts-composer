import {
  GridLocation,
  GridMode,
  GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { OrientationOption } from "./level5-lab-types";


/**
 * Maps each centric GridPlacement to its [blue, red] hand locations.
 * TAU1-8:  blue at center, red at perimeter
 * TAU9-16: red at center, blue at perimeter
 * TERRA1:  both at center
 */
export const PLACEMENT_LOCATIONS: Partial<
  Record<GridPlacement, [GridLocation, GridLocation]>
> = {
  // Blue at center, red at perimeter
  [GridPlacement.TAU1]: [GridLocation.CENTER, GridLocation.NORTH],
  [GridPlacement.TAU2]: [GridLocation.CENTER, GridLocation.NORTHEAST],
  [GridPlacement.TAU3]: [GridLocation.CENTER, GridLocation.EAST],
  [GridPlacement.TAU4]: [GridLocation.CENTER, GridLocation.SOUTHEAST],
  [GridPlacement.TAU5]: [GridLocation.CENTER, GridLocation.SOUTH],
  [GridPlacement.TAU6]: [GridLocation.CENTER, GridLocation.SOUTHWEST],
  [GridPlacement.TAU7]: [GridLocation.CENTER, GridLocation.WEST],
  [GridPlacement.TAU8]: [GridLocation.CENTER, GridLocation.NORTHWEST],
  // Red at center, blue at perimeter
  [GridPlacement.TAU9]: [GridLocation.NORTH, GridLocation.CENTER],
  [GridPlacement.TAU10]: [GridLocation.NORTHEAST, GridLocation.CENTER],
  [GridPlacement.TAU11]: [GridLocation.EAST, GridLocation.CENTER],
  [GridPlacement.TAU12]: [GridLocation.SOUTHEAST, GridLocation.CENTER],
  [GridPlacement.TAU13]: [GridLocation.SOUTH, GridLocation.CENTER],
  [GridPlacement.TAU14]: [GridLocation.SOUTHWEST, GridLocation.CENTER],
  [GridPlacement.TAU15]: [GridLocation.WEST, GridLocation.CENTER],
  [GridPlacement.TAU16]: [GridLocation.NORTHWEST, GridLocation.CENTER],
  // Both at center
  [GridPlacement.TERRA1]: [GridLocation.CENTER, GridLocation.CENTER],
};


/** Tau Diamond: perimeter prop at cardinal point (N/E/S/W) */
export const TAU_DIAMOND_PLACEMENTS: GridPlacement[] = [
  GridPlacement.TAU1,
  GridPlacement.TAU3,
  GridPlacement.TAU5,
  GridPlacement.TAU7,
  GridPlacement.TAU9,
  GridPlacement.TAU11,
  GridPlacement.TAU13,
  GridPlacement.TAU15,
];

/** Tau Box: perimeter prop at intercardinal point (NE/SE/SW/NW) */
export const TAU_BOX_PLACEMENTS: GridPlacement[] = [
  GridPlacement.TAU2,
  GridPlacement.TAU4,
  GridPlacement.TAU6,
  GridPlacement.TAU8,
  GridPlacement.TAU10,
  GridPlacement.TAU12,
  GridPlacement.TAU14,
  GridPlacement.TAU16,
];

/** Terra: both hands at center */
export const TERRA_PLACEMENTS: GridPlacement[] = [GridPlacement.TERRA1];


/** Radial orientations for perimeter-positioned props */
export const RADIAL_ORIENTATIONS: readonly OrientationOption[] = [
  { value: Orientation.IN, label: "In", icon: "fa-compress-arrows-alt" },
  { value: Orientation.OUT, label: "Out", icon: "fa-expand-arrows-alt" },
  { value: Orientation.CLOCK, label: "CW", icon: "fa-rotate-right" },
  { value: Orientation.COUNTER, label: "CCW", icon: "fa-rotate-left" },
] as const;

/** Compass orientations for center-positioned props */
export const COMPASS_ORIENTATIONS: readonly OrientationOption[] = [
  { value: Orientation.CENTER_N, label: "N", icon: "fa-arrow-up" },
  { value: Orientation.CENTER_NE, label: "NE", icon: "fa-arrow-up", rotation: 45 },
  { value: Orientation.CENTER_E, label: "E", icon: "fa-arrow-right" },
  { value: Orientation.CENTER_SE, label: "SE", icon: "fa-arrow-down", rotation: -45 },
  { value: Orientation.CENTER_S, label: "S", icon: "fa-arrow-down" },
  { value: Orientation.CENTER_SW, label: "SW", icon: "fa-arrow-down", rotation: 45 },
  { value: Orientation.CENTER_W, label: "W", icon: "fa-arrow-left" },
  { value: Orientation.CENTER_NW, label: "NW", icon: "fa-arrow-up", rotation: -45 },
] as const;


const CARDINAL_LOCATIONS: ReadonlySet<GridLocation> = new Set<GridLocation>([
  GridLocation.NORTH,
  GridLocation.EAST,
  GridLocation.SOUTH,
  GridLocation.WEST,
]);

/** Determine grid mode from the perimeter prop's location */
export function getGridModeForPlacement(placement: GridPlacement): GridMode {
  const locations = PLACEMENT_LOCATIONS[placement];
  if (!locations) return GridMode.DIAMOND;
  const [leftLoc, rightLoc] = locations;
  const perimeterLoc =
    leftLoc === GridLocation.CENTER ? rightLoc : leftLoc;
  if (perimeterLoc === GridLocation.CENTER) return GridMode.DIAMOND;
  return CARDINAL_LOCATIONS.has(perimeterLoc) ? GridMode.DIAMOND : GridMode.BOX;
}

/** Format a GridPlacement enum value to display label (e.g. "tau1" -> "Tau1") */
export function formatPlacement(pos: GridPlacement): string {
  const match = pos.match(/^(tau|terra)(\d+)$/i);
  if (match?.[1] && match[2]) {
    return `${match[1].charAt(0).toUpperCase()}${match[1].slice(1)}${match[2]}`;
  }
  return pos.toUpperCase();
}

/** Whether a hand is at center for a given placement */
export function isHandAtCenter(
  placement: GridPlacement,
  hand: "left" | "right"
): boolean {
  const locations = PLACEMENT_LOCATIONS[placement];
  if (!locations) return false;
  const index = hand === "left" ? 0 : 1;
  return locations[index] === GridLocation.CENTER;
}

/** Whether an orientation value is a compass (center) orientation */
export function isCenterOrientation(ori: Orientation): boolean {
  return (ori as string).startsWith("center");
}
