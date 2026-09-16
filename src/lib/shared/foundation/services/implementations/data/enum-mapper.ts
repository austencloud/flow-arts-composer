import {
  GridLocation,
  GridPlacement,
} from "../../../../pictograph/grid/domain/enums/grid-enums";
import {
  MotionType,
  Orientation,
  RotationDirection,
} from "../../../../pictograph/shared/domain/enums/pictograph-enums";

export function mapMotionType(motionType: string): MotionType {
  if (!motionType) return MotionType.STATIC;

  switch (motionType.toLowerCase().trim()) {
    case "pro":
      return MotionType.PRO;
    case "anti":
      return MotionType.ANTI;
    case "float":
      return MotionType.FLOAT;
    case "dash":
      return MotionType.DASH;
    case "static":
      return MotionType.STATIC;
    default:
      console.warn(
        `⚠️ mapMotionType: unknown motion type "${motionType}", defaulting to STATIC`
      );
      return MotionType.STATIC;
  }
}

export function mapLocation(location: string): GridLocation {
  if (!location) {
    console.warn(
      `⚠️ mapLocation: location is null/undefined, defaulting to NORTH`
    );
    return GridLocation.NORTH;
  }

  switch (location.toLowerCase().trim()) {
    case "n":
      return GridLocation.NORTH;
    case "e":
      return GridLocation.EAST;
    case "s":
      return GridLocation.SOUTH;
    case "w":
      return GridLocation.WEST;
    case "ne":
      return GridLocation.NORTHEAST;
    case "se":
      return GridLocation.SOUTHEAST;
    case "sw":
      return GridLocation.SOUTHWEST;
    case "nw":
      return GridLocation.NORTHWEST;
    default:
      console.warn(
        `⚠️ mapLocation: unknown location "${location}", defaulting to NORTH`
      );
      return GridLocation.NORTH;
  }
}

export function mapOrientation(orientation: string): Orientation {
  if (!orientation) return Orientation.IN;

  switch (orientation.toLowerCase().trim()) {
    case "in":
      return Orientation.IN;
    case "out":
      return Orientation.OUT;
    case "clock":
      return Orientation.CLOCK;
    case "counter":
      return Orientation.COUNTER;
    default:
      console.warn(
        `⚠️ mapOrientation: unknown orientation "${orientation}", defaulting to IN`
      );
      return Orientation.IN;
  }
}

export function mapRotationDirection(
  rotationDirection: string
): RotationDirection {
  if (!rotationDirection) return RotationDirection.NO_ROTATION;

  switch (rotationDirection.toLowerCase().trim()) {
    case "cw":
      return RotationDirection.CLOCKWISE;
    case "ccw":
      return RotationDirection.COUNTER_CLOCKWISE;
    case "norotation":
    case "no_rot":
      return RotationDirection.NO_ROTATION;
    default:
      console.warn(
        `⚠️ mapRotationDirection: unknown rotation direction "${rotationDirection}", defaulting to NO_ROTATION`
      );
      return RotationDirection.NO_ROTATION;
  }
}

export function convertToGridPlacement(
  positionString: string | null | undefined
): GridPlacement | null {
  if (!positionString) return null;

  const lowerPosition = positionString.toLowerCase().trim();
  const gridPlacementValues = Object.values(GridPlacement);

  for (const position of gridPlacementValues) {
    if (position.toLowerCase() === lowerPosition) {
      return position as GridPlacement;
    }
  }

  console.warn(
    `⚠️ convertToGridPlacement: unknown position "${positionString}", returning null`
  );
  return null;
}

export function normalizeMotionType(motionType: string): string {
  return motionType.toLowerCase().trim();
}

export function normalizeLocation(location: string): string {
  return location.toLowerCase().trim();
}

export function normalizeTurns(turns: number | string): number {
  return turns === "fl" ? 0.5 : Number(turns) || 0;
}

/**
 * Object bundle of the enum-mapper functions, retained so existing
 * dependency-injection call sites (CSVPictographParser, SequenceImporter)
 * keep an object to call `.mapMotionType(...)` etc. on. The class wrapper
 * was dissolved into the module-level functions above.
 */
export const enumMapper = {
  mapMotionType,
  mapLocation,
  mapOrientation,
  mapRotationDirection,
  convertToGridPlacement,
  normalizeMotionType,
  normalizeLocation,
  normalizeTurns,
};

/** Structural type of the enum-mapper bundle, for DI parameter typing. */
export type EnumMapper = typeof enumMapper;
