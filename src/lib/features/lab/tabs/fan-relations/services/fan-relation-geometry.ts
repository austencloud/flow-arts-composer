import { Plane, type PropState3D } from "@austencloud/scene-3d";
import type { Vector3 } from "three";
import { LOCATION_ANGLES } from "#lib/shared/foundation/domain/math-constants.js";
import {
  GridLocation,
  type GridMode,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import PropRotAngleManager from "#lib/shared/pictograph/prop/services/prop-rot-angle-manager.js";
import {
  Orientation,
  type Orientation as OrientationValue,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  getPlaneRight,
  getPlaneUp,
} from "#lib/shared/3d/domain/constants/plane-transforms.js";
import {
  calculatePropRotation,
  gridLocationToPosition3D,
} from "#lib/shared/3d/services/plane-coordinate-mapper.js";
import {
  FanViewpoint,
  type FanViewpoint as FanViewpointValue,
} from "../domain/fan-relation-types";

const LOCATION_LABELS: Record<GridLocation, string> = {
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

const ORIENTATION_LABELS: Record<OrientationValue, string> = {
  [Orientation.IN]: "In",
  [Orientation.OUT]: "Out",
  [Orientation.CLOCK]: "Clock",
  [Orientation.COUNTER]: "Counter",
  [Orientation.CLOCK_IN]: "Clock-in",
  [Orientation.CLOCK_OUT]: "Clock-out",
  [Orientation.COUNTER_IN]: "Counter-in",
  [Orientation.COUNTER_OUT]: "Counter-out",
  [Orientation.CENTER_N]: "North",
  [Orientation.CENTER_NE]: "Northeast",
  [Orientation.CENTER_E]: "East",
  [Orientation.CENTER_SE]: "Southeast",
  [Orientation.CENTER_S]: "South",
  [Orientation.CENTER_SW]: "Southwest",
  [Orientation.CENTER_W]: "West",
  [Orientation.CENTER_NW]: "Northwest",
};

export const VIEWPOINT_CAMERA: Record<
  FanViewpointValue,
  {
    position: [number, number, number];
    target: [number, number, number];
    hiddenAxis: "x" | "y" | "z";
    label: string;
  }
> = {
  [FanViewpoint.AUDIENCE]: {
    position: [0, 0.85, 4.5],
    target: [0, 0.85, 0],
    hiddenAxis: "z",
    label: "Audience",
  },
  [FanViewpoint.STAGE_RIGHT]: {
    position: [4.5, 0.85, 0],
    target: [0, 0.85, 0],
    hiddenAxis: "x",
    label: "Stage right",
  },
  [FanViewpoint.ABOVE]: {
    position: [0, 4.5, 0.001],
    target: [0, 0, 0],
    hiddenAxis: "y",
    label: "Above",
  },
};

const PLANE_NORMAL_AXIS: Record<Plane, "x" | "y" | "z"> = {
  [Plane.WALL]: "z",
  [Plane.WHEEL]: "x",
  [Plane.FLOOR]: "y",
  [Plane.RIGHT_SHIELD]: "z",
  [Plane.LEFT_SHIELD]: "z",
  [Plane.FORWARD_RAMP]: "y",
  [Plane.BACKWARD_RAMP]: "y",
  [Plane.RIGHT_WING]: "x",
  [Plane.LEFT_WING]: "x",
};

const FAN_BLADE_RADIUS_RATIO = 0.5;
const BIG_FAN_SCALE = 30 / 13;
const MIN_FAN_HAND_RADIUS = 0.34;
const MAX_FAN_HAND_RADIUS = 0.42;
const FAN_HAND_RADIUS_TO_LENGTH = 0.48;
const FAN_GRID_PADDING = 0.12;
const BASE_FAN_PLANE_OFFSET = 0.3;
const MAX_FAN_PLANE_OFFSET = 0.42;

export interface FanSceneLayout {
  /** Where the performer holds the fan, measured from body center. */
  handRadius: number;
  /** Furthest visual extent of the open fan from body center. */
  outerRadius: number;
  /** Half-size of the rendered inspection plane. */
  gridSize: number;
  /** How far the working plane sits in front of the performer. */
  forwardOffset: number;
  /** 0 = hands stay on their natural sides, 1 = a full cross-body reach. */
  crossBodyDemand: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function getCrossBodyDemand(
  leftLocation: GridLocation,
  rightLocation: GridLocation,
  handRadius: number
): number {
  const left = gridLocationToPosition3D(Plane.WALL, leftLocation, handRadius);
  const right = gridLocationToPosition3D(Plane.WALL, rightLocation, handRadius);

  // Blue is the performer's left hand and naturally occupies -X. Red is the
  // right hand and naturally occupies +X. Reaching the other way asks the
  // torso and shoulders to follow instead of forcing an arm through the chest.
  const leftCross = Math.max(0, left.x) / handRadius;
  const rightCross = Math.max(0, -right.x) / handRadius;
  const centerDemand =
    leftLocation === GridLocation.CENTER || rightLocation === GridLocation.CENTER
      ? 0.35
      : 0;

  return clamp01(Math.max(leftCross, rightCross, centerDemand));
}

/**
 * Fans use a reachable hand grid plus a prop-sized outer field. The hand ring
 * stays inside the avatar's cross-body reach; the outer ring grows with the
 * open fan instead of borrowing the staff grid's tip geometry.
 */
export function getFanSceneLayout({
  leftLocation,
  rightLocation,
  propType,
  basePropLength,
}: {
  leftLocation: GridLocation;
  rightLocation: GridLocation;
  propType: PropType;
  basePropLength: number;
}): FanSceneLayout {
  const handRadius = Math.max(
    MIN_FAN_HAND_RADIUS,
    Math.min(MAX_FAN_HAND_RADIUS, basePropLength * FAN_HAND_RADIUS_TO_LENGTH)
  );
  const fanScale = propType === PropType.BIGFAN ? BIG_FAN_SCALE : 1;
  const bladeRadius = basePropLength * FAN_BLADE_RADIUS_RATIO * fanScale;
  const outerRadius = handRadius + bladeRadius;
  const crossBodyDemand = getCrossBodyDemand(
    leftLocation,
    rightLocation,
    handRadius
  );

  return {
    handRadius,
    outerRadius,
    gridSize: outerRadius + FAN_GRID_PADDING,
    forwardOffset:
      BASE_FAN_PLANE_OFFSET +
      (MAX_FAN_PLANE_OFFSET - BASE_FAN_PLANE_OFFSET) * crossBodyDemand,
    crossBodyDemand,
  };
}

export function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

export function getFanHeadingDegrees(
  location: GridLocation,
  orientation: OrientationValue,
  gridMode: GridMode
): number {
  return normalizeDegrees(
    PropRotAngleManager.calculateRotation(location, orientation, gridMode)
  );
}

export function getWorldHeadingVector(
  headingDegrees: number,
  presentationPlane: Plane
): Vector3 {
  const radians = (normalizeDegrees(headingDegrees) * Math.PI) / 180;
  const east = getPlaneRight(presentationPlane);
  const north = getPlaneUp(presentationPlane);
  return east
    .clone()
    .multiplyScalar(Math.cos(radians))
    .add(north.clone().multiplyScalar(-Math.sin(radians)))
    .normalize();
}

function axisWord(
  value: number,
  positive: string,
  negative: string
): string | null {
  if (Math.abs(value) < 0.35) return null;
  return value > 0 ? positive : negative;
}

export function describeWorldHeading(vector: Vector3): string {
  const parts = [
    axisWord(vector.y, "Sky", "Ground"),
    axisWord(vector.z, "Downstage", "Upstage"),
    axisWord(vector.x, "Performer right", "Performer left"),
  ].filter((part): part is string => part !== null);
  return parts.join(" + ") || "No heading";
}

export function getHeadingSeparationDegrees(
  firstDegrees: number,
  secondDegrees: number
): number {
  const raw = Math.abs(
    normalizeDegrees(firstDegrees) - normalizeDegrees(secondDegrees)
  );
  return raw > 180 ? 360 - raw : raw;
}

export function describeHeadingSeparation(degrees: number): string {
  if (degrees < 1) return "Same heading";
  if (Math.abs(degrees - 180) < 1) return "Opposite headings";
  if (Math.abs(degrees - 90) < 1) return "Perpendicular headings";
  return `${Math.round(degrees)}° apart`;
}

export function buildFanPropState({
  location,
  orientation,
  gridMode,
  presentationPlane,
  handRadius,
}: {
  location: GridLocation;
  orientation: OrientationValue;
  gridMode: GridMode;
  presentationPlane: Plane;
  handRadius?: number;
}): PropState3D {
  const centerPathAngle = LOCATION_ANGLES[location];
  const headingDegrees = getFanHeadingDegrees(location, orientation, gridMode);
  const headingRadians = (headingDegrees * Math.PI) / 180;

  return {
    centerPathAngle,
    staffRotationAngle: headingRadians,
    // Placement stays on the front body grid while the fan itself may lie in
    // another plane. This separation is the purpose of the relation lab.
    plane: presentationPlane,
    worldPosition: gridLocationToPosition3D(Plane.WALL, location, handRadius),
    worldRotation: calculatePropRotation(presentationPlane, headingRadians),
  };
}

export function getProjectionDescription(
  presentationPlane: Plane,
  viewpoint: FanViewpointValue
): { faceOn: boolean; text: string } {
  const view = VIEWPOINT_CAMERA[viewpoint];
  const faceOn = PLANE_NORMAL_AXIS[presentationPlane] === view.hiddenAxis;

  if (faceOn) {
    return {
      faceOn,
      text: `${view.label} shows the fan face and its heading.`,
    };
  }

  if (
    presentationPlane === Plane.FLOOR &&
    viewpoint === FanViewpoint.AUDIENCE
  ) {
    return {
      faceOn,
      text: "Audience sees the fan edge-on and hides depth. Upstage and downstage headings can share the same line-like projection.",
    };
  }

  if (
    presentationPlane === Plane.FLOOR &&
    viewpoint === FanViewpoint.STAGE_RIGHT
  ) {
    return {
      faceOn,
      text: "Stage right keeps the fan edge-on but reveals its upstage or downstage heading.",
    };
  }

  const hiddenDimension =
    view.hiddenAxis === "z"
      ? "depth"
      : view.hiddenAxis === "x"
        ? "left-to-right depth"
        : "height";
  return {
    faceOn,
    text: `${view.label} hides ${hiddenDimension}. Different 3D orientations can share the same line-like projection.`,
  };
}

export function getLocationLabel(location: GridLocation): string {
  return LOCATION_LABELS[location];
}

export function getOrientationLabel(orientation: OrientationValue): string {
  return ORIENTATION_LABELS[orientation];
}
