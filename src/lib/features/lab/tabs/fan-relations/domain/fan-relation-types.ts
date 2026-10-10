import type { Plane } from "@austencloud/scene-3d";
import type {
  GridLocation,
  GridMode,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

export const FanViewpoint = {
  AUDIENCE: "audience",
  STAGE_RIGHT: "stage-right",
  ABOVE: "above",
} as const;

export type FanViewpoint = (typeof FanViewpoint)[keyof typeof FanViewpoint];

export const WorkingFanRelation = {
  UNLABELED: "unlabeled",
  C: "C",
  CC: "CC",
  I: "I",
  S: "S",
  X: "X",
  O: "O",
  W: "W",
} as const;

export type WorkingFanRelation =
  (typeof WorkingFanRelation)[keyof typeof WorkingFanRelation];

export interface FanHandConfiguration {
  location: GridLocation;
  orientation: Orientation;
}

export interface FanRelationConfiguration {
  gridMode: GridMode;
  left: FanHandConfiguration;
  right: FanHandConfiguration;
  presentationPlane: Plane;
  viewpoint: FanViewpoint;
  workingRelation: WorkingFanRelation;
}
