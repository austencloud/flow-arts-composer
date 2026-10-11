import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { Plane } from "@austencloud/scene-3d";

export const BODY_CENTER = { x: 300, y: 330 } as const;
export const SHOULDER_DIST = 34;
export const MAX_REACH = 165;
export const BEHIND_THRESHOLD = 30;
export const MAX_ROTATION_SPEED = 3;

export interface Preset {
  name: string;
  left: GridLocation;
  right: GridLocation;
}

export const PRESETS: Preset[] = [
  { name: "L:W R:E",      left: GridLocation.WEST,      right: GridLocation.EAST },
  { name: "L:E R:W",      left: GridLocation.EAST,      right: GridLocation.WEST },
  { name: "Both E",       left: GridLocation.EAST,      right: GridLocation.EAST },
  { name: "Both W",       left: GridLocation.WEST,      right: GridLocation.WEST },
  { name: "Both N",       left: GridLocation.NORTH,     right: GridLocation.NORTH },
  { name: "Both S",       left: GridLocation.SOUTH,     right: GridLocation.SOUTH },
  { name: "L:NW R:NE",    left: GridLocation.NORTHWEST, right: GridLocation.NORTHEAST },
  { name: "L:SW R:SE",    left: GridLocation.SOUTHWEST, right: GridLocation.SOUTHEAST },
];

export const VIEW_TO_CAMERA: Record<string, "front" | "top" | "side"> = {
  wall: "front",
  wheel: "side",
  floor: "top",
};

export const VIEW_TO_PLANE: Record<string, Plane> = {
  wall: Plane.WALL,
  wheel: Plane.WHEEL,
  floor: Plane.FLOOR,
};
