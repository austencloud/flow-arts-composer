import { rotateLocation } from "$lib/shared/create/services/rotation-helpers";
import {
  GridMode,
  type GridLocation,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  deriveGridMode,
  usesBoxLocations,
  usesDiamondLocations,
} from "$lib/shared/pictograph/grid/services/grid-mode-deriver";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import { applyRotationMatrix } from "$lib/shared/pictograph/arrow/orchestration/services/arrow-coordinate-transformer";

const BOX_FRAME_ROTATION_DEGREES = 45;

export interface PlacementVector {
  x: number;
  y: number;
}

export interface CanonicalPlacementContext {
  pictographData: PictographData;
  motionData: MotionData;
  location?: GridLocation;
  displayedGridMode: GridMode;
  /**
   * The grid whose points hold this arrow's starting anchor when it differs
   * from the displayed grid. Only set for a Skewed beat's one-grid arrows.
   */
  anchorGridMode?: GridMode;
  rotationDegrees: 0 | 45;
}

/**
 * Resolve the grid that owns the visible anchor. This mirrors the preparer's
 * precedence so an explicit pictograph or render override cannot disagree with
 * the placement frame.
 */
export function resolveDisplayedPlacementGridMode(
  pictographData: PictographData,
  motionData: MotionData,
  gridModeOverride?: GridMode
): GridMode {
  if (gridModeOverride) return gridModeOverride;
  if (pictographData.gridMode) return pictographData.gridMode;
  if (motionData.gridMode) return motionData.gridMode;

  const left = pictographData.motions.left;
  const right = pictographData.motions.right;
  return left && right ? deriveGridMode(left, right) : GridMode.DIAMOND;
}

/**
 * Box is a 45° presentation of the diamond coordinate frame. Normalize the
 * complete lookup context before any placement tier derives keys or values.
 */
export function createCanonicalPlacementContext(
  pictographData: PictographData,
  motionData: MotionData,
  location?: GridLocation,
  gridModeOverride?: GridMode
): CanonicalPlacementContext {
  const displayedGridMode = resolveDisplayedPlacementGridMode(
    pictographData,
    motionData,
    gridModeOverride
  );

  if (displayedGridMode === GridMode.BOX) {
    return rotateToCanonical(
      pictographData,
      motionData,
      location,
      displayedGridMode,
      GridMode.DIAMOND
    );
  }

  // A Skewed beat pairs a hand that stays on the diamond points with a hand
  // that stays on the box points. Each of those arrows is an ordinary Diamond
  // or Box arrow, so it starts from that grid's anchor and takes the default
  // adjustment that grid gives it. Otherwise a box-point arrow starts 62 px
  // closer to the center than Box starts it and can end up on top of its own
  // prop. The grid mode stays
  // Skewed, so placements saved for skewed beats keep their own keys. An arrow
  // that crosses between the grids has no Box or Diamond equivalent and keeps
  // the skewed anchors.
  if (displayedGridMode === GridMode.SKEWED) {
    if (usesBoxLocations(motionData)) {
      return {
        ...rotateToCanonical(
          pictographData,
          motionData,
          location,
          displayedGridMode
        ),
        anchorGridMode: GridMode.BOX,
      };
    }
    if (usesDiamondLocations(motionData)) {
      return {
        pictographData,
        motionData,
        location,
        displayedGridMode,
        anchorGridMode: GridMode.DIAMOND,
        rotationDegrees: 0,
      };
    }
  }

  return {
    pictographData,
    motionData,
    location,
    displayedGridMode,
    rotationDegrees: 0,
  };
}

/**
 * Turn the whole beat back one 45° step, so a box-point arrow is looked up and
 * adjusted as the diamond arrow it presents. Leaving `canonicalGridMode` out
 * keeps each motion's own grid mode.
 */
function rotateToCanonical(
  pictographData: PictographData,
  motionData: MotionData,
  location: GridLocation | undefined,
  displayedGridMode: GridMode,
  canonicalGridMode?: GridMode
): CanonicalPlacementContext {
  const canonicalMotions = Object.fromEntries(
    Object.entries(pictographData.motions).map(([color, motion]) => [
      color,
      motion ? toCanonicalMotion(motion, canonicalGridMode) : undefined,
    ])
  ) as PictographData["motions"];
  const canonicalMotion = toCanonicalMotion(motionData, canonicalGridMode);
  canonicalMotions[motionData.hand] = canonicalMotion;

  return {
    pictographData: {
      ...pictographData,
      ...(canonicalGridMode && { gridMode: canonicalGridMode }),
      motions: canonicalMotions,
    },
    motionData: canonicalMotion,
    location: location
      ? (rotateLocation(location, -1) as GridLocation)
      : undefined,
    displayedGridMode,
    rotationDegrees: BOX_FRAME_ROTATION_DEGREES,
  };
}

/** Rotate a canonical diamond screen vector into the displayed grid. */
export function rotatePlacementVectorToDisplayed(
  vector: PlacementVector,
  rotationDegrees: 0 | 45
): PlacementVector {
  if (rotationDegrees === 0) return { x: vector.x, y: vector.y };
  const [x, y] = applyRotationMatrix(vector.x, vector.y, rotationDegrees);
  return { x, y };
}

/** Rotate a canonical arrow-glyph angle into the displayed grid. */
export function rotatePlacementAngleToDisplayed(
  angleDegrees: number,
  rotationDegrees: 0 | 45
): number {
  return (((angleDegrees + rotationDegrees) % 360) + 360) % 360;
}

/**
 * WASD deltas are requested in visible screen space. Undo the box presentation
 * rotation before the diamond directional-tuple inverse is applied.
 */
export function rotateScreenVectorToCanonical(
  vector: PlacementVector,
  rotationDegrees: 0 | 45
): PlacementVector {
  if (rotationDegrees === 0) return { x: vector.x, y: vector.y };
  const [x, y] = applyRotationMatrix(vector.x, vector.y, -rotationDegrees);
  return { x, y };
}

function toCanonicalMotion(
  motion: MotionData,
  canonicalGridMode?: GridMode
): MotionData {
  return {
    ...motion,
    ...(canonicalGridMode && { gridMode: canonicalGridMode }),
    startLocation: rotateLocation(motion.startLocation, -1) as GridLocation,
    endLocation: rotateLocation(motion.endLocation, -1) as GridLocation,
    arrowLocation: rotateLocation(motion.arrowLocation, -1) as GridLocation,
  };
}
