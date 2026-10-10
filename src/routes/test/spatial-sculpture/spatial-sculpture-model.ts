import { Plane } from "@austencloud/scene-3d";
import {
  GridLocation,
  type GridLocation as GridLocationValue,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";

export const PRIMARY_PLANES = [Plane.WALL, Plane.WHEEL, Plane.FLOOR] as const;

export type PrimaryPlane = (typeof PRIMARY_PLANES)[number];
export type PropSide = "left" | "right";
export type SculpturePreset = "solo" | "mirror" | "acolyte" | "radial";
export type LayoutMode = "viewport" | "studio";
export type SculptureMotionMode = "trace" | "undulate";
export type BeatOrientation = "in" | "out";
export type BeatTurns = "0" | "½" | "1";

export interface SpatialBeat {
  id: string;
  plane: PrimaryPlane;
  leftLocation: GridLocationValue;
  rightLocation: GridLocationValue;
  leftOrientation: BeatOrientation;
  rightOrientation: BeatOrientation;
  turns: BeatTurns;
}

export const PLANE_LABELS: Record<PrimaryPlane, string> = {
  [Plane.WALL]: "Wall",
  [Plane.WHEEL]: "Wheel",
  [Plane.FLOOR]: "Floor",
};

export const LOCATION_LABELS: Record<GridLocationValue, string> = {
  [GridLocation.NORTH]: "North",
  [GridLocation.NORTHEAST]: "Northeast",
  [GridLocation.EAST]: "East",
  [GridLocation.SOUTHEAST]: "Southeast",
  [GridLocation.SOUTH]: "South",
  [GridLocation.SOUTHWEST]: "Southwest",
  [GridLocation.WEST]: "West",
  [GridLocation.NORTHWEST]: "Northwest",
  [GridLocation.CENTER]: "Center",
};

export const LOCATION_ORDER: GridLocationValue[] = [
  GridLocation.NORTH,
  GridLocation.NORTHEAST,
  GridLocation.EAST,
  GridLocation.SOUTHEAST,
  GridLocation.SOUTH,
  GridLocation.SOUTHWEST,
  GridLocation.WEST,
  GridLocation.NORTHWEST,
];

export const LAYOUT_OPTIONS: { value: LayoutMode; label: string }[] = [
  { value: "viewport", label: "Viewport" },
  { value: "studio", label: "Step studio" },
];

export const HAND_OPTIONS: {
  value: PropSide;
  label: string;
  tone: "blue" | "red";
}[] = [
  { value: "left", label: "Left path", tone: "blue" },
  { value: "right", label: "Right path", tone: "red" },
];

export const MOTION_OPTIONS: {
  value: SculptureMotionMode;
  label: string;
}[] = [
  { value: "trace", label: "Trace" },
  { value: "undulate", label: "Undulate" },
];

export const PLANE_OPTIONS: { value: PrimaryPlane; label: string }[] = [
  { value: Plane.WALL, label: "Wall" },
  { value: Plane.WHEEL, label: "Wheel" },
  { value: Plane.FLOOR, label: "Floor" },
];

export const ORIENTATION_OPTIONS: {
  value: BeatOrientation;
  label: string;
}[] = [
  { value: "in", label: "In" },
  { value: "out", label: "Out" },
];

export const TURN_OPTIONS: { value: BeatTurns; label: string }[] = [
  { value: "0", label: "0" },
  { value: "½", label: "½" },
  { value: "1", label: "1" },
];

export const PRESET_OPTIONS: {
  value: SculpturePreset;
  label: string;
  count: number;
}[] = [
  { value: "solo", label: "Solo", count: 1 },
  { value: "mirror", label: "Mirror", count: 2 },
  { value: "acolyte", label: "Acolyte", count: 6 },
  { value: "radial", label: "Radial", count: 8 },
];

export const INITIAL_SPATIAL_BEATS: SpatialBeat[] = [
  {
    id: "beat-1",
    plane: Plane.WALL,
    leftLocation: GridLocation.NORTHEAST,
    rightLocation: GridLocation.SOUTHWEST,
    leftOrientation: "in",
    rightOrientation: "out",
    turns: "0",
  },
  {
    id: "beat-2",
    plane: Plane.WHEEL,
    leftLocation: GridLocation.NORTH,
    rightLocation: GridLocation.SOUTH,
    leftOrientation: "out",
    rightOrientation: "in",
    turns: "½",
  },
  {
    id: "beat-3",
    plane: Plane.FLOOR,
    leftLocation: GridLocation.EAST,
    rightLocation: GridLocation.WEST,
    leftOrientation: "in",
    rightOrientation: "in",
    turns: "1",
  },
  {
    id: "beat-4",
    plane: Plane.WALL,
    leftLocation: GridLocation.SOUTHWEST,
    rightLocation: GridLocation.NORTHEAST,
    leftOrientation: "out",
    rightOrientation: "out",
    turns: "½",
  },
  {
    id: "beat-5",
    plane: Plane.WHEEL,
    leftLocation: GridLocation.WEST,
    rightLocation: GridLocation.EAST,
    leftOrientation: "in",
    rightOrientation: "out",
    turns: "0",
  },
  {
    id: "beat-6",
    plane: Plane.FLOOR,
    leftLocation: GridLocation.NORTHWEST,
    rightLocation: GridLocation.SOUTHEAST,
    leftOrientation: "out",
    rightOrientation: "in",
    turns: "1",
  },
  {
    id: "beat-7",
    plane: Plane.WALL,
    leftLocation: GridLocation.SOUTH,
    rightLocation: GridLocation.NORTH,
    leftOrientation: "in",
    rightOrientation: "in",
    turns: "½",
  },
  {
    id: "beat-8",
    plane: Plane.WHEEL,
    leftLocation: GridLocation.SOUTHEAST,
    rightLocation: GridLocation.NORTHWEST,
    leftOrientation: "out",
    rightOrientation: "out",
    turns: "0",
  },
];

export function freshSpatialBeats(): SpatialBeat[] {
  return INITIAL_SPATIAL_BEATS.map((beat) => ({ ...beat }));
}
