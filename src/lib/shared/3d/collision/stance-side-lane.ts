/**
 * How wide each hand's side-on lane has to open so its staff stays out of the
 * body.
 *
 * Once the chest turns side-on, the stance corridor
 * (`planUpperBodyStanceDepth`) brings both grips in toward the chest's centre
 * line in depth and gives each hand a lane on its own shoulder's side. The
 * lane is a single width for every pose, and the turned torso is wider than
 * it: a staff held level with the chest in a 16 cm lane passes straight
 * through it. Widening every lane fixes the chest and costs grip in holds
 * whose staffs never came near the body.
 *
 * This answers it per hand and per moment: the narrowest lane, from the
 * body's own lane outward, that keeps that hand's staff no further into the
 * head or torso than it is with the chest square. The chest pose and the
 * corridor are the ones the frame will use, through the same planner call, so
 * the check and the frame agree about where the grips go. A staff no lane can
 * clear gets the lane that brings it out furthest.
 *
 * The chest's turn is left alone. Turning less keeps the staffs clear too,
 * but the turn is what keeps both arms in front of the chest, and capping it
 * refused grips the hands could otherwise hold.
 */

import {
  GRID_OFFSETS,
  PLANE_MODE_CONFIGS,
  type PlaneMode,
} from "@austencloud/scene-3d";
import type { PerformerReachMeasurements } from "$lib/shared/3d/domain/performer-reach-measurements";
import {
  planUpperBodyStanceDepth,
  sameSideLaneM,
  stanceTargetsForPropStates,
  type GripPropState,
  type SideOnLanes,
} from "./upper-body-stance-planner";
import {
  DEFAULT_STAFF_BODY_CLEARANCE_BODY,
  clearanceStaffForProp,
  staffBodyIntrusionM,
  type BodyYawPose,
  type ClearanceStaff,
  type StaffBodyClearanceBody,
} from "./staff-body-clearance";

/** The body the stance is checked against. */
export interface StanceClearance {
  body: StaffBodyClearanceBody;
  /**
   * The reach measurements the per-frame read passes. They set the body's own
   * lane, so the check has to use the same ones to test the grips where the
   * frame will put them.
   */
  measurements?: PerformerReachMeasurements | null;
}

export const DEFAULT_STANCE_CLEARANCE: Readonly<StanceClearance> =
  Object.freeze({
    body: DEFAULT_STAFF_BODY_CLEARANCE_BODY,
    measurements: null,
  });

/**
 * The widest a lane may open. At 26 cm a staff held beside the chest clears
 * the clavicles. On the scoreboard two more centimetres cleared 6 to 12 more
 * torso frames per rig and lost about 25 grips, since every centimetre takes
 * the hand further from its shoulder.
 */
export const MAX_SIDE_ON_LANE_M = 0.26;
const LANE_STEP_M = 0.01;
/** A lane may leave this much more intrusion than the square stance and pass. */
const SQUARE_ALLOWANCE_M = 0.001;
/**
 * A staff no lane clears takes the narrowest lane within this of the best
 * any lane does, rather than the widest for a sliver of depth.
 */
const BEST_EFFORT_TOLERANCE_M = 0.001;

const SQUARE_POSE: BodyYawPose = { spine1Rad: 0, chestRad: 0, headRad: 0 };

/**
 * The lane each hand needs at one moment of the score: the props as the score
 * puts them, before any hard-beat displacement, with the chest posed by
 * `pose` and the props asking for `propDesireRad`. A hand without a prop, or
 * whose staff already clears at the body's own lane, gets that lane.
 */
export function planSideOnLaneFloor(
  planeMode: PlaneMode,
  left: GripPropState | null,
  right: GripPropState | null,
  pose: BodyYawPose,
  propDesireRad: number,
  clearance: StanceClearance = DEFAULT_STANCE_CLEARANCE
): SideOnLanes {
  const { body } = clearance;
  const measurements = clearance.measurements ?? null;
  const baseM = sameSideLaneM(measurements);
  if (pose.chestRad === 0 || (!left && !right)) {
    return { leftM: baseM, rightM: baseM };
  }
  const mode = PLANE_MODE_CONFIGS[planeMode];
  const gridOffset = GRID_OFFSETS[planeMode];
  const targets = stanceTargetsForPropStates(planeMode, left, right);
  const staffAt = (
    prop: GripPropState,
    lateralM: number,
    depthM: number
  ): ClearanceStaff =>
    clearanceStaffForProp(prop, lateralM, gridOffset, depthM, body);

  const lanes = [baseM];
  for (let lane = baseM + LANE_STEP_M; lane <= MAX_SIDE_ON_LANE_M + 1e-9; ) {
    lanes.push(lane);
    lane += LANE_STEP_M;
  }
  // A measured body's own lane is off the centimetre grid, so its steps stop
  // short of the widest lane.
  if (lanes[lanes.length - 1]! < MAX_SIDE_ON_LANE_M - 1e-9) {
    lanes.push(MAX_SIDE_ON_LANE_M);
  }
  const plans = lanes.map((lane) =>
    planUpperBodyStanceDepth(
      pose.chestRad,
      targets,
      measurements,
      propDesireRad,
      {
        leftM: lane,
        rightM: lane,
      }
    )
  );

  const laneFor = (
    prop: GripPropState | null,
    lateralM: number,
    depthOf: (plan: (typeof plans)[number]) => number
  ): number => {
    if (!prop) return baseM;
    const square = staffBodyIntrusionM(
      [staffAt(prop, lateralM, 0)],
      SQUARE_POSE,
      body
    );
    const allowed = Math.max(0, square) + SQUARE_ALLOWANCE_M;
    const intrusionAt = (index: number, stopAboveM = Infinity) =>
      staffBodyIntrusionM(
        [staffAt(prop, lateralM, depthOf(plans[index]!))],
        pose,
        body,
        stopAboveM
      );
    for (let i = 0; i < lanes.length; i++) {
      if (intrusionAt(i, allowed) <= allowed) return lanes[i]!;
    }
    // No lane clears it: the one that brings it out furthest.
    const intrusions = lanes.map((_, i) => intrusionAt(i));
    const best = Math.min(...intrusions);
    const index = intrusions.findIndex(
      (intrusion) => intrusion <= best + BEST_EFFORT_TOLERANCE_M
    );
    return lanes[index]!;
  };

  return {
    leftM: laneFor(
      left,
      mode.blueLateralOffset,
      (plan) => plan.leftDepthOffsetM
    ),
    rightM: laneFor(
      right,
      mode.redLateralOffset,
      (plan) => plan.rightDepthOffsetM
    ),
  };
}
