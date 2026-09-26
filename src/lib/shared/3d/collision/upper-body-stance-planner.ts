import {
  planHugReachGeometry,
  type PerformerReachMeasurements,
} from "$lib/shared/3d/domain/performer-reach-measurements";
import {
  GRID_OFFSETS,
  PLANE_MODE_CONFIGS,
  type PlaneMode,
  type PropState3D,
} from "@austencloud/scene-3d";

export interface GripTargetXZ {
  x: number;
  z: number;
}

export interface UpperBodyStanceTargets {
  left: GripTargetXZ | null;
  right: GripTargetXZ | null;
}

export interface UpperBodyStancePlan {
  yawRad: number;
  pitchRad: number;
  leftDepthOffsetM: number;
  rightDepthOffsetM: number;
}

/**
 * How far each hand's side-on lane sits from the chest's centre line, metres.
 * As a floor, a hand's lane is the larger of this and the body's own lane.
 */
export interface SideOnLanes {
  leftM: number;
  rightM: number;
}

// Just short of a full quarter turn. At exactly 90 degrees the shoulder line
// runs parallel to the rig's root forward, which is the degenerate case the
// animator's own body-frame code calls out: the disambiguating dot product
// sits at zero, and sampling the turned shoulders back into the next solve
// limit-cycles. On ch18 that showed as a periodic 8.2-degree flicker in the
// achieved shoulder yaw at a held side stance. Three degrees of margin leaves
// the singularity while staying visually side-on.
export const MAX_STANCE_YAW_RAD = (87 * Math.PI) / 180;
const LATERAL_DEAD_ZONE_M = 0.1;
/**
 * Lateral mean at which the turn is fully assisted. Exported so a timing
 * readout can plot the prop signal in the same units the planner reads it,
 * rather than inventing a second scale for the same number.
 */
export const FULL_ASSIST_LATERAL_M = 0.28;
// The hidden-depth budget between the two grips during a fully side-on hold.
// The pair straddles the chest centerline, so each hand takes half of it on its
// own shoulder's side. From the audience the two staffs still overlay; between
// the arms each one gets its own corridor. 16 cm was enough while both grips
// sat a full grid offset in front of the torso; centering them on the chest
// brings each shaft back into the torso's depth band, so the budget now has to
// clear the widest supported torso rather than merely overlay the two staffs.
// At an 8 cm lane the swing frames grazed the intake chest by 5-6 mm and the
// bulkier ch18 chest by 1-2 cm; a 16 cm lane clears every sampled frame on all
// three verified rigs and still sits well inside a ~22 cm shoulder half-span,
// so both grips stay between the arms.
//
// Re-measured after the hug became a wrist rotation rather than a grip
// translation: the lane is still load-bearing and cannot be traded for wrist
// angle. Overriding the intake rig's measured 11.6 cm lane while everything
// else stayed fixed put the shaft into the torso by 15 mm at 8 cm, 28 mm at
// 4 cm, and 38 mm at 0. This lane is a torso-clearance corridor, not a
// convergence mechanism; converging further needs a shorter staff, which is
// what `fitStaffLengthForHug` is for.
//
// It is the body's lane, not every staff's. Measured against the mesh
// (`tests/unit/3d/performer-contact-scoreboard.ts`), a 16 cm lane still left
// staffs through the chest on 642 of ch07's frames and 1271 of ch18's: a staff
// at the south point, held upstage while the chest is side-on, runs through
// the sternum at any lane inside the chest's half width. Each hand's lane now
// opens past this one where its own staff needs the room
// (`stance-side-lane.ts`).
/** Below this yaw the corridor is closed and the grips keep their depth. */
export const SIDE_ON_YAW_KNEE_RAD = MAX_STANCE_YAW_RAD * 0.8;
const SAME_SIDE_DEPTH_SEPARATION_M = 0.32;
const SAME_SIDE_DEPTH_LANE_M = SAME_SIDE_DEPTH_SEPARATION_M / 2;

/**
 * Share of the shoulder line each spine bone carries at rest. Matches the
 * animator's historical blade split, so a held stance is bone-for-bone the
 * pose that shipped before the score-time track existed. Here rather than in
 * the track so the clearance check can hold the same pose without importing
 * the track.
 */
export const SPINE1_SHARE = 0.45;
export const SPINE2_SHARE = 0.55;

/**
 * The hug reach. Once a rig has been measured, the pair no longer straddles
 * the chest at a fixed 16 cm: each grip converges to its body's own hug lane,
 * so the two outstretched arms close toward the chest-forward midline. The
 * shaft that used to pass beside the chest now sits inside the torso's depth
 * band, which is why the prop seam shortens the staff by the same
 * measurements — see `fitStaffLengthForHug`. Without measurements the planner
 * keeps the wider un-measured lane rather than guessing at a body.
 */
export function sameSideLaneM(
  measurements: PerformerReachMeasurements | null
): number {
  if (!measurements) return SAME_SIDE_DEPTH_LANE_M;
  return Math.min(
    SAME_SIDE_DEPTH_LANE_M,
    planHugReachGeometry(measurements).laneM
  );
}

const SQUARE_STANCE: UpperBodyStancePlan = {
  yawRad: 0,
  pitchRad: 0,
  leftDepthOffsetM: 0,
  rightDepthOffsetM: 0,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function smoothstep01(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * The lateral mean of the two grips in the grid frame; positive is the
 * performer's +X side. Exposed so a score-time visualization can plot the prop
 * signal the yaw is derived from on the same axis as the yaw itself, without
 * re-deriving the mean from raw prop states.
 */
export function stanceLateralMean(targets: UpperBodyStanceTargets): number {
  const active = [targets.left, targets.right].filter(
    (target): target is GripTargetXZ => target !== null
  );
  if (active.length < 2) return 0;
  return active.reduce((sum, target) => sum + target.x, 0) / active.length;
}

/**
 * The yaw this grip geometry wants, as a memoryless function of where the props
 * are right now.
 *
 * This is the planner's *desire*, not its delivered motion. It has no history
 * and no lookahead, so on its own it can never start a turn before the props
 * are already lateral. `stance-yaw-track.ts` owns turning a whole sequence of
 * these samples into a motion curve with anticipation and successive-breaking
 * overlap; this function stays the single geometry authority both paths agree
 * on.
 *
 * Split targets intentionally cancel: when one hand is east and the other is
 * west, the avatar stays square. A coherent same-side pair uses the same yaw
 * sign as its lateral placement so the performer's shoulders and face turn
 * toward the props and both arms remain in front of the chest.
 */
export function planUpperBodyStanceYawTarget(
  targets: UpperBodyStanceTargets
): number {
  const active = [targets.left, targets.right].filter(
    (target): target is GripTargetXZ => target !== null
  );
  if (active.length < 2) return 0;

  const meanX =
    active.reduce((sum, target) => sum + target.x, 0) / active.length;
  const meanAbsX =
    active.reduce((sum, target) => sum + Math.abs(target.x), 0) / active.length;
  if (meanAbsX < 1e-6) return 0;

  const coherence = clamp(Math.abs(meanX) / meanAbsX, 0, 1);
  const lateralWeight = smoothstep01(
    (Math.abs(meanX) - LATERAL_DEAD_ZONE_M) /
      (FULL_ASSIST_LATERAL_M - LATERAL_DEAD_ZONE_M)
  );
  if (coherence < 0.35 || lateralWeight === 0) return 0;

  // Every wall-grid point carries the same forward plane offset. Folding that
  // depth into atan2 made a true E/W two-hand hold look merely diagonal and
  // left the far shoulder reaching through the neck. Lateral placement owns
  // the stance direction; coherence and lateralWeight still soften entrances.
  const desiredYaw = Math.sign(meanX) * MAX_STANCE_YAW_RAD;
  const assistance = smoothstep01(coherence) * lateralWeight;
  return (
    clamp(desiredYaw, -MAX_STANCE_YAW_RAD, MAX_STANCE_YAW_RAD) * assistance
  );
}

/**
 * How far the side-on corridor is engaged, 0 to 1, for a chest turned by
 * `yawRad` while the props ask for `propDesireRad`. Exported so the hard-beat
 * depth lanes hand over to the corridor on the same curve instead of
 * re-deriving it.
 *
 * Only an aligned desire counts. Through a reversal the delivered yaw passes
 * through zero while the props still ask for the side it is leaving, and
 * opening a corridor in the sign of a near-zero yaw would steer the grips the
 * wrong way at exactly the frame they are least committed.
 */
export function stanceSideBlend(
  yawRad: number,
  propDesireRad: number = yawRad
): number {
  if (yawRad === 0) return 0;
  const alignedDesireRad =
    Math.sign(propDesireRad) === Math.sign(yawRad)
      ? Math.abs(propDesireRad)
      : 0;
  const sideOnRad = Math.max(Math.abs(yawRad), alignedDesireRad);
  return smoothstep01(
    (sideOnRad - SIDE_ON_YAW_KNEE_RAD) /
      (MAX_STANCE_YAW_RAD - SIDE_ON_YAW_KNEE_RAD)
  );
}

/**
 * The reach corridor for a chest that is *already* turned by `yawRad`.
 *
 * Split out from the yaw decision so a planned score-time curve can drive the
 * chest while the hands still resolve against a corridor that knows about both
 * halves of the moment.
 *
 * `propDesireRad` is what this frame's actual grip geometry asks for, which is
 * the same number as `yawRad` on the memoryless path and differs from it only
 * while a score-time curve is deliberately out of phase with the props. The
 * corridor opens on whichever of the two is further side-on, provided they
 * agree about which way the body is turning.
 *
 * That matters because the corridor protects a mismatch, not a chest. Measured
 * on ch18 over a 400-frame sweep: with the corridor keyed to the chest alone, a
 * curve that led the props by 0.22 steps took 25 collision frames at 57.8 mm
 * against the memoryless baseline's 11 at 36.5 mm, and a curve that trailed
 * them took 14 at 27.7 mm. Both directions of phase error hurt, because in both
 * the grips sit at an authored depth the chest no longer faces. Reading the
 * larger of the two closes the window from either side, and because the two
 * numbers are equal whenever no curve is driving, the memoryless path is
 * bit-for-bit unchanged.
 */
export function planUpperBodyStanceDepth(
  yawRad: number,
  targets: UpperBodyStanceTargets,
  measurements: PerformerReachMeasurements | null = null,
  propDesireRad: number = yawRad,
  laneFloor: SideOnLanes | null = null
): UpperBodyStancePlan {
  if (yawRad === 0) return SQUARE_STANCE;

  // Once the chest turns, the grid's forward offset stops being forward: it
  // becomes a sideways shift along the audience axis, which is what left both
  // arms angled toward the audience with the near staff crossing the torso.
  // Re-express the two grips in the turned chest frame instead. The chest's own
  // lateral axis is the audience depth axis at a full side hold, so cancelling
  // the target's depth puts both hands directly in front of the chest, and each
  // hand then takes its own shoulder's depth lane so neither arm crosses the
  // body. Lateral placement is never touched, so the audience silhouette and
  // the authored grid point are unchanged.
  // The re-expression engages only once the chest is genuinely side-on. A
  // linear ramp would drag the rear grip through the torso's depth band while
  // the chest is still half square, which is where the bulkier rigs took shaft
  // hits mid-transition. Below SIDE_ON_YAW_KNEE the grips keep their authored
  // depth and the pose is simply the old square-ish reach.
  const sideBlend = stanceSideBlend(yawRad, propDesireRad);
  // Each hand's lane opens past the body's own where its staff needs the room.
  const laneM = sameSideLaneM(measurements);
  const leftLaneM = Math.max(laneM, laneFloor?.leftM ?? 0);
  const rightLaneM = Math.max(laneM, laneFloor?.rightM ?? 0);
  // Rig convention: the performer's left is rig-local +X, so a positive stance
  // yaw swings the left shoulder toward negative depth.
  const side = Math.sign(yawRad);
  return {
    yawRad,
    // Same-side reaches need shoulder facing, not a permanent bow. Cross-body
    // pitch and reach-deficit lean remain owned by the animator and engage only
    // when their geometry actually calls for them.
    pitchRad: 0,
    leftDepthOffsetM: sideBlend * (-side * leftLaneM - (targets.left?.z ?? 0)),
    rightDepthOffsetM:
      sideBlend * (side * rightLaneM - (targets.right?.z ?? 0)),
  };
}

/**
 * The memoryless plan: this frame's geometric yaw and the corridor that yaw
 * implies. Every surface that has no score-time track available still routes
 * here, and the track's own samples are built from the same two owners.
 */
export function planUpperBodyStance(
  targets: UpperBodyStanceTargets,
  measurements: PerformerReachMeasurements | null = null
): UpperBodyStancePlan {
  return planUpperBodyStanceDepth(
    planUpperBodyStanceYawTarget(targets),
    targets,
    measurements
  );
}

export function planUpperBodyStanceYaw(
  targets: UpperBodyStanceTargets
): number {
  return planUpperBodyStanceYawTarget(targets);
}

/**
 * A prop as the stance reads it. The rotation is optional: the yaw and the
 * corridor need only the grip, and the clearance check tests the whole staff
 * when the rotation is there and the grip alone when it is not.
 */
export type GripPropState = Pick<PropState3D, "worldPosition"> &
  Partial<Pick<PropState3D, "worldRotation">>;

/**
 * The grid-frame grip targets behind a rendered prop pair. One owner for the
 * plane-mode lateral offsets and grid depth, so the per-frame plan and the
 * score-time track can never disagree about where the props are.
 */
export function stanceTargetsForPropStates(
  planeMode: PlaneMode,
  left: GripPropState | null,
  right: GripPropState | null
): UpperBodyStanceTargets {
  const mode = PLANE_MODE_CONFIGS[planeMode];
  const gridOffset = GRID_OFFSETS[planeMode];
  return {
    left: left
      ? {
          x: mode.blueLateralOffset + left.worldPosition.x,
          z: gridOffset + left.worldPosition.z,
        }
      : null,
    right: right
      ? {
          x: mode.redLateralOffset + right.worldPosition.x,
          z: gridOffset + right.worldPosition.z,
        }
      : null,
  };
}

/**
 * Convert the two rendered prop targets into the shared body-facing plan.
 * Every live sequence surface uses this seam so a diagnostic route cannot
 * silently pose the arms without the shoulder turn used by the app.
 */
export function planUpperBodyStanceForPropStates(
  planeMode: PlaneMode,
  left: GripPropState | null,
  right: GripPropState | null,
  measurements: PerformerReachMeasurements | null = null
): UpperBodyStancePlan {
  return planUpperBodyStance(
    stanceTargetsForPropStates(planeMode, left, right),
    measurements
  );
}
