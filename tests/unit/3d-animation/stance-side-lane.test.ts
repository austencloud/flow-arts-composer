import { describe, expect, it } from "vitest";
import { Quaternion, Vector3 } from "three";
import {
  GRID_OFFSETS,
  PLANE_MODE_CONFIGS,
  PlaneMode,
} from "@austencloud/scene-3d";
import {
  DEFAULT_STANCE_CLEARANCE,
  MAX_SIDE_ON_LANE_M,
  planSideOnLaneFloor,
  type StanceClearance,
} from "$lib/shared/3d/collision/stance-side-lane";
import {
  DEFAULT_STAFF_BODY_CLEARANCE_BODY,
  clearanceStaffForProp,
  staffBodyIntrusionM,
  type BodyYawPose,
  type StaffBodyClearanceBody,
} from "$lib/shared/3d/collision/staff-body-clearance";
import {
  MAX_STANCE_YAW_RAD,
  SPINE1_SHARE,
  planUpperBodyStanceDepth,
  sameSideLaneM,
  stanceTargetsForPropStates,
  type GripPropState,
} from "$lib/shared/3d/collision/upper-body-stance-planner";

/**
 * Staffs on the wall grid of the scene's default performer (190.5 cm, 34-inch
 * staff): the grid centre is at shoulder height and each hand point sits 0.6
 * staff lengths from it. The chest is held fully side-on, turned toward the
 * performer's left, so the corridor takes the left grip upstage and the right
 * grip downstage.
 */
const BODY = DEFAULT_STAFF_BODY_CLEARANCE_BODY;
const HAND_POINT_M = 0.6 * BODY.staffLengthM;
const LANE = 0.16;
/** Tolerance the planner allows over the square stance's intrusion. */
const ALLOWANCE_M = 0.001;
/** The staff runs along the prop's local -x; this turns it vertical. */
const VERTICAL = new Quaternion(0, 0, -Math.SQRT1_2, Math.SQRT1_2);
const LEVEL = new Quaternion();
const SQUARE: BodyYawPose = { spine1Rad: 0, chestRad: 0, headRad: 0 };
const SIDE_ON: BodyYawPose = {
  spine1Rad: SPINE1_SHARE * MAX_STANCE_YAW_RAD,
  chestRad: MAX_STANCE_YAW_RAD,
  headRad: MAX_STANCE_YAW_RAD,
};
const GRID_OFFSET_M = GRID_OFFSETS[PlaneMode.WALL];
const MODE = PLANE_MODE_CONFIGS[PlaneMode.WALL];
/** A measured body whose own lane is narrower than the default's. */
const MEASURED = {
  upperArmM: 0.28,
  forearmM: 0.32,
  shoulderWidthM: 0.44,
  reachM: 0.6,
};

/** A staff whose centre (the grip) is at `x`, `y` on the grid. Without a
 *  rotation only the grip is known. */
function staff(x: number, y: number, rotation?: Quaternion): GripPropState {
  const worldPosition = new Vector3(x, y, 0);
  return rotation
    ? { worldPosition, worldRotation: rotation }
    : { worldPosition };
}

function lanesSideOn(
  left: GripPropState | null,
  right: GripPropState | null,
  clearance: StanceClearance = DEFAULT_STANCE_CLEARANCE
) {
  return planSideOnLaneFloor(
    PlaneMode.WALL,
    left,
    right,
    SIDE_ON,
    MAX_STANCE_YAW_RAD,
    clearance
  );
}

/** How far one hand's staff comes into the body, side-on, with that hand's
 *  lane at `laneM`, placed by the same corridor the frame uses. */
function intrusionAtLane(
  hand: "left" | "right",
  prop: GripPropState,
  laneM: number,
  body: StaffBodyClearanceBody = BODY
): number {
  const left = hand === "left" ? prop : null;
  const right = hand === "right" ? prop : null;
  const plan = planUpperBodyStanceDepth(
    MAX_STANCE_YAW_RAD,
    stanceTargetsForPropStates(PlaneMode.WALL, left, right),
    null,
    MAX_STANCE_YAW_RAD,
    { leftM: laneM, rightM: laneM }
  );
  const lateralM =
    hand === "left" ? MODE.blueLateralOffset : MODE.redLateralOffset;
  const depthM =
    hand === "left" ? plan.leftDepthOffsetM : plan.rightDepthOffsetM;
  return staffBodyIntrusionM(
    [clearanceStaffForProp(prop, lateralM, GRID_OFFSET_M, depthM, body)],
    SIDE_ON,
    body
  );
}

describe("side-on lane floor", () => {
  it("keeps the body's own lane while the chest is square", () => {
    const south = staff(0, -HAND_POINT_M, VERTICAL);
    expect(
      planSideOnLaneFloor(PlaneMode.WALL, south, south, SQUARE, 0)
    ).toEqual({ leftM: LANE, rightM: LANE });
  });

  it("keeps the body's own lane for staffs that already clear the body", () => {
    // Held out in front of the turned chest, and level above the head.
    const east = staff(HAND_POINT_M, 0, VERTICAL);
    const north = staff(0, HAND_POINT_M, LEVEL);
    for (const prop of [east, north]) {
      expect(lanesSideOn(prop, prop)).toEqual({ leftM: LANE, rightM: LANE });
    }
  });

  it("opens a hand's lane to the narrowest that keeps its staff out of the body", () => {
    // Held upright at the south point, the downstage staff runs through the
    // turned chest at the body's own lane.
    const south = staff(0, -HAND_POINT_M, VERTICAL);
    const lanes = lanesSideOn(null, south);
    expect(lanes.leftM).toBe(LANE);
    expect(lanes.rightM).toBeGreaterThan(LANE + 0.005);
    expect(lanes.rightM).toBeLessThanOrEqual(MAX_SIDE_ON_LANE_M + 1e-9);

    // Clear with the chest square, so that is the bar the lane has to meet.
    const square = staffBodyIntrusionM(
      [
        clearanceStaffForProp(
          south,
          MODE.redLateralOffset,
          GRID_OFFSET_M,
          0,
          BODY
        ),
      ],
      SQUARE,
      BODY
    );
    expect(square).toBeLessThan(0);
    expect(intrusionAtLane("right", south, LANE)).toBeGreaterThan(ALLOWANCE_M);
    expect(intrusionAtLane("right", south, lanes.rightM)).toBeLessThanOrEqual(
      ALLOWANCE_M
    );
    expect(
      intrusionAtLane("right", south, lanes.rightM - 0.01)
    ).toBeGreaterThan(ALLOWANCE_M);
  });

  it("gives a staff no lane clears the widest lane, where it comes out furthest", () => {
    // Too thick for any lane: a level staff at chest height.
    const thick = { ...BODY, staffRadiusM: 0.08 };
    const chestHigh = staff(0, 1.45 - BODY.gridHeightM, LEVEL);
    const lanes = lanesSideOn(chestHigh, null, {
      body: thick,
      measurements: null,
    });
    expect(lanes.leftM).toBeCloseTo(MAX_SIDE_ON_LANE_M, 9);
    expect(lanes.rightM).toBe(LANE);
    const widest = intrusionAtLane(
      "left",
      chestHigh,
      MAX_SIDE_ON_LANE_M,
      thick
    );
    expect(widest).toBeGreaterThan(ALLOWANCE_M);
    expect(widest).toBeLessThan(
      intrusionAtLane("left", chestHigh, LANE, thick)
    );
  });

  it("starts from a measured body's own lane", () => {
    const base = sameSideLaneM(MEASURED);
    expect(base).toBeLessThan(LANE);
    const east = staff(HAND_POINT_M, 0, VERTICAL);
    expect(
      lanesSideOn(east, east, { body: BODY, measurements: MEASURED })
    ).toEqual({
      leftM: base,
      rightM: base,
    });
  });

  it("opens a measured body's lane all the way to the widest", () => {
    // Its own lane is off the centimetre grid, so whole-centimetre steps from
    // it stop short of the widest lane, and a staff no lane clears needs that.
    const thick = { ...BODY, staffRadiusM: 0.08 };
    const chestHigh = staff(0, 1.45 - BODY.gridHeightM, LEVEL);
    const lanes = lanesSideOn(chestHigh, null, {
      body: thick,
      measurements: MEASURED,
    });
    expect(lanes.leftM).toBeCloseTo(MAX_SIDE_ON_LANE_M, 9);
    expect(lanes.rightM).toBe(sameSideLaneM(MEASURED));
  });
});
