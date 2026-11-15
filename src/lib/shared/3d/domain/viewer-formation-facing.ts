import { calculateFacingAngle } from "@austencloud/scene-3d";
import { DEFAULT_VIEWER_FRONT_STAGE_FACING_ANGLE } from "./viewer-front-stage";

export {
  DEFAULT_VIEWER_FRONT_STAGE_CAMERA_Z_SIGN,
  DEFAULT_VIEWER_FRONT_STAGE_FACING_ANGLE,
  EMBER_VIEWER_FRONT_STAGE_CAMERA_Z_SIGN,
  EMBER_VIEWER_FRONT_STAGE_FACING_ANGLE,
  getViewerFrontStageCameraZ,
  getViewerFrontStageFacingAngle,
} from "./viewer-front-stage";

// The package exports `calculateFacingAngle` but not the `Formation`/
// `FormationSlot` types its signature is built from, so derive them from the
// function itself rather than re-declaring the shapes by hand.
type FormationSlot = Parameters<typeof calculateFacingAngle>[0];
type Formation = Parameters<typeof calculateFacingAngle>[1];

export function resolveViewerFormationFacingAngle(
  slot: FormationSlot | undefined,
  formation: Formation,
  fallbackAngle: number,
  frontStageFacingAngle = DEFAULT_VIEWER_FRONT_STAGE_FACING_ANGLE
): number {
  if (slot?.facingAngle !== undefined) return slot.facingAngle;
  if (formation.facingMode === "same-direction") {
    return frontStageFacingAngle;
  }
  return slot ? calculateFacingAngle(slot, formation) : fallbackAngle;
}
