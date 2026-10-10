/**
 * Regression test: 3D prop orientation and position.
 *
 * X is negated in planeAngleToWorldPosition for wall/floor planes
 * so east appears on screen right from the -Z camera (right-handed).
 *
 * Quaternion uses positive staffAngle to compensate for X flip.
 */

import { describe, it, expect } from "vitest";
import { Vector3, Quaternion, Euler } from "three";
import { Orientation, MotionType } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { Plane } from "@austencloud/scene-3d";
import { LOCATION_ANGLES } from "#lib/shared/foundation/domain/math-constants.js";
import {
  planeAngleToWorldPosition,
  calculatePropQuaternion,
} from "#lib/shared/3d/domain/constants/plane-transforms.js";
import { mapOrientationToAngle } from "#lib/shared/3d/services/orientation-mapper.js";


function getTBarDirection(staffAngle: number, plane: Plane): Vector3 {
  const worldRot = calculatePropQuaternion(plane, staffAngle);
  const horizontalQuat = new Quaternion().setFromEuler(new Euler(0, 0, Math.PI / 2));
  const fullQuat = worldRot.clone().multiply(horizontalQuat);
  // T-bar at +halfLength = +Y local space (for positive quaternion / X-negated system)
  return new Vector3(0, 1, 0).applyQuaternion(fullQuat);
}

describe("3D Prop — X-negated positions, positive quaternion", () => {

  describe("Positions: east=-X(screen right from -Z), west=+X(screen left)", () => {
    it("east → -X", () => {
      const pos = planeAngleToWorldPosition(Plane.WALL, LOCATION_ANGLES[GridLocation.EAST]);
      expect(pos.x).toBeLessThan(0);
    });
    it("west → +X", () => {
      const pos = planeAngleToWorldPosition(Plane.WALL, LOCATION_ANGLES[GridLocation.WEST]);
      expect(pos.x).toBeGreaterThan(0);
    });
    it("north → +Y", () => {
      const pos = planeAngleToWorldPosition(Plane.WALL, LOCATION_ANGLES[GridLocation.NORTH]);
      expect(pos.y).toBeGreaterThan(0);
    });
    it("south → -Y", () => {
      const pos = planeAngleToWorldPosition(Plane.WALL, LOCATION_ANGLES[GridLocation.SOUTH]);
      expect(pos.y).toBeLessThan(0);
    });
  });

  describe("Orientation: IN=toward center, OUT=away", () => {
    // With X-negated positions, the "outward" direction from east is -X.
    // T-bar for IN should point opposite = +X (toward center from east position).
    // The orientation mapper uses un-mirrored center angles.
    // The quaternion uses positive staffAngle.
    // Need to verify if this combination produces correct T-bar directions.

    function checkOrientation(loc: GridLocation, ori: Orientation): number {
      const centerAngle = LOCATION_ANGLES[loc];
      const staffAngle = mapOrientationToAngle(ori, centerAngle);
      const pos = planeAngleToWorldPosition(Plane.WALL, centerAngle);
      const outward = pos.clone().normalize();
      const tBar = getTBarDirection(staffAngle, Plane.WALL);
      return tBar.dot(outward);
    }

    const locs = [GridLocation.NORTH, GridLocation.EAST, GridLocation.SOUTH, GridLocation.WEST];

    for (const loc of locs) {
      it(`IN at ${loc}: T-bar toward center (dot < 0)`, () => {
        expect(checkOrientation(loc, Orientation.IN)).toBeLessThan(-0.5);
      });
      it(`OUT at ${loc}: T-bar away from center (dot > 0)`, () => {
        expect(checkOrientation(loc, Orientation.OUT)).toBeGreaterThan(0.5);
      });
    }
  });
});
