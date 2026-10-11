import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { Plane } from "@austencloud/scene-3d";

export interface SequenceBeat {
  left: GridLocation;
  right: GridLocation;
  plane?: Plane;
  label?: string;
}

export interface DemoSequence {
  name: string;
  description: string;
  beats: SequenceBeat[];
}

export const DEMO_SEQUENCES: DemoSequence[] = [
  {
    name: "Mirror Sweep",
    description: "Symmetric east-west sweep — no body turn needed",
    beats: [
      { left: GridLocation.WEST, right: GridLocation.EAST, label: "L:W R:E" },
      { left: GridLocation.NORTHWEST, right: GridLocation.NORTHEAST, label: "L:NW R:NE" },
      { left: GridLocation.NORTH, right: GridLocation.NORTH, label: "Both N" },
      { left: GridLocation.NORTHEAST, right: GridLocation.NORTHWEST, label: "L:NE R:NW" },
      { left: GridLocation.EAST, right: GridLocation.WEST, label: "L:E R:W" },
      { left: GridLocation.SOUTHEAST, right: GridLocation.SOUTHWEST, label: "L:SE R:SW" },
      { left: GridLocation.SOUTH, right: GridLocation.SOUTH, label: "Both S" },
      { left: GridLocation.SOUTHWEST, right: GridLocation.SOUTHEAST, label: "L:SW R:SE" },
    ],
  },
  {
    name: "Crossing",
    description: "Arms cross center — crossing detector fires",
    beats: [
      { left: GridLocation.WEST, right: GridLocation.EAST, label: "L:W R:E" },
      { left: GridLocation.SOUTHWEST, right: GridLocation.SOUTHEAST, label: "Inward" },
      { left: GridLocation.SOUTH, right: GridLocation.SOUTH, label: "Both S — close" },
      { left: GridLocation.EAST, right: GridLocation.WEST, label: "Crossed! L:E R:W" },
      { left: GridLocation.NORTHEAST, right: GridLocation.NORTHWEST, label: "Still crossed" },
      { left: GridLocation.WEST, right: GridLocation.EAST, label: "Back to start" },
    ],
  },
  {
    name: "Body Turn 90°",
    description: "Both props shift east — body auto-turns to face stage-right",
    beats: [
      { left: GridLocation.WEST, right: GridLocation.EAST, label: "L:W R:E (neutral)" },
      { left: GridLocation.SOUTH, right: GridLocation.EAST, label: "L moves S" },
      { left: GridLocation.SOUTHEAST, right: GridLocation.NORTHEAST, label: "Both E side" },
      { left: GridLocation.EAST, right: GridLocation.EAST, label: "Both E" },
      { left: GridLocation.SOUTHEAST, right: GridLocation.NORTHEAST, label: "Returning" },
      { left: GridLocation.WEST, right: GridLocation.EAST, label: "Back to neutral" },
    ],
  },
  {
    name: "Height Sweep",
    description: "Props sweep north-south — visible body reaction",
    beats: [
      { left: GridLocation.SOUTHWEST, right: GridLocation.SOUTHEAST, label: "Both low" },
      { left: GridLocation.WEST, right: GridLocation.EAST, label: "Both mid" },
      { left: GridLocation.NORTHWEST, right: GridLocation.NORTHEAST, label: "Both high" },
      { left: GridLocation.NORTH, right: GridLocation.NORTH, label: "Both top" },
      { left: GridLocation.NORTHWEST, right: GridLocation.NORTHEAST, label: "Descending" },
      { left: GridLocation.WEST, right: GridLocation.EAST, label: "Back to mid" },
    ],
  },
  {
    name: "Full Rotation",
    description: "Left prop circles the grid — body tracks it",
    beats: [
      { left: GridLocation.EAST, right: GridLocation.WEST, label: "Start: L:E R:W" },
      { left: GridLocation.NORTHEAST, right: GridLocation.WEST, label: "L → NE" },
      { left: GridLocation.NORTH, right: GridLocation.WEST, label: "L → N" },
      { left: GridLocation.NORTHWEST, right: GridLocation.WEST, label: "L → NW" },
      { left: GridLocation.WEST, right: GridLocation.WEST, label: "L → W (same!)" },
      { left: GridLocation.SOUTHWEST, right: GridLocation.WEST, label: "L → SW" },
      { left: GridLocation.SOUTH, right: GridLocation.WEST, label: "L → S" },
      { left: GridLocation.SOUTHEAST, right: GridLocation.WEST, label: "L → SE" },
    ],
  },
];
