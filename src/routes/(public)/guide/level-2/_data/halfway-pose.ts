/**
 * Exact mid-motion (halfway) staff poses for the Level 2 breakdown strips.
 *
 * Rather than hand-tune each intermediate staff angle, this asks the REAL
 * animation engine where a prop is at stepProgress 0.5 - the same math the
 * live animator uses - so the printed "pause here" frame matches playback
 * exactly, turns included.
 *
 * `interpolatePropAngles` returns, per hand:
 *   centerPathAngle   - hand-center orbit angle
 *   staffRotationAngle - the staff's own rotation
 * `calculatePropCenter`'s recipe (radius = gridHalfwayOffset 150 at the 950
 * viewBox) converts the orbit angle to a viewBox point; the staff SVG is then
 * drawn `translate(cx,cy) rotate(deg) translate(-126.4,-38.9)` (its crossbar
 * sits at the +x end), identical to StaffMotionsPage's overlay.
 */
import { interpolatePropAngles } from "#lib/shared/animation-engine/services/prop-interpolator.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import {
  MotionType,
  HandSide,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { GridMode, type GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";

const VIEWBOX = 950;
const CENTER = VIEWBOX / 2; // 475
const HALFWAY_RADIUS = 150; // gridHalfwayOffset at gridScaleFactor 1 (950 canvas)

export type HalfwayMotion = {
  type: MotionType;
  from: GridLocation;
  to: GridLocation;
  rot: RotationDirection;
  startOri: Orientation;
  endOri: Orientation;
  turns?: number;
};

export type StaffPose = { cx: number; cy: number; deg: number };

/** Force the arc/linear path so the interpolator never reads global visibility
 *  state: shifts pass through the diagonal grid point (the guide's "diagonal
 *  halfway"), dashes travel straight, statics pivot in place. */
function pathShapeFor(type: MotionType): "arc" | "linear" {
  return type === MotionType.DASH ? "linear" : "arc";
}

/** The staff pose (viewBox coords + degrees) at an arbitrary stepProgress `t`
 *  (0 = start, 0.5 = halfway, 1 = end). Used by the 2-turn pedagogy pages that
 *  break a double turn into thirds/quarters. */
export function poseAt(m: HalfwayMotion, t: number, hand: HandSide = HandSide.RIGHT): StaffPose {
  const motion = createMotionData({
    motionType: m.type,
    rotationDirection: m.rot,
    startLocation: m.from,
    endLocation: m.to,
    startOrientation: m.startOri,
    endOrientation: m.endOri,
    turns: m.turns ?? 0,
    hand,
    propType: PropType.STAFF,
    gridMode: GridMode.DIAMOND,
    pathShape: pathShapeFor(m.type),
  });
  const step = {
    id: "poseat",
    letter: null,
    gridMode: GridMode.DIAMOND,
    motions: { [hand]: motion },
  } as unknown as StepData;

  const result = interpolatePropAngles(step, t);
  const angles = hand === HandSide.LEFT ? result.leftAngles : result.rightAngles;
  if (!angles) return { cx: CENTER, cy: CENTER, deg: 0 };

  const { x, y } =
    angles.x !== undefined && angles.y !== undefined
      ? { x: angles.x, y: angles.y }
      : { x: Math.cos(angles.centerPathAngle), y: Math.sin(angles.centerPathAngle) };

  return {
    cx: CENTER + x * HALFWAY_RADIUS,
    cy: CENTER + y * HALFWAY_RADIUS,
    deg: (angles.staffRotationAngle * 180) / Math.PI,
  };
}

/** The halfway staff pose (viewBox coords + degrees) for one hand's motion. */
export function halfwayPose(m: HalfwayMotion, hand: HandSide = HandSide.RIGHT): StaffPose {
  const motion = createMotionData({
    motionType: m.type,
    rotationDirection: m.rot,
    startLocation: m.from,
    endLocation: m.to,
    startOrientation: m.startOri,
    endOrientation: m.endOri,
    turns: m.turns ?? 0,
    hand,
    propType: PropType.STAFF,
    gridMode: GridMode.DIAMOND,
    pathShape: pathShapeFor(m.type),
  });
  const step = {
    id: "halfway",
    letter: null,
    gridMode: GridMode.DIAMOND,
    motions: { [hand]: motion },
  } as unknown as StepData;

  const result = interpolatePropAngles(step, 0.5);
  const angles = hand === HandSide.LEFT ? result.leftAngles : result.rightAngles;
  // Static motion with 0 turns never moves - no meaningful halfway; caller
  // should not request one, but guard anyway.
  if (!angles) return { cx: CENTER, cy: CENTER, deg: 0 };

  const { x, y } =
    angles.x !== undefined && angles.y !== undefined
      ? { x: angles.x, y: angles.y }
      : { x: Math.cos(angles.centerPathAngle), y: Math.sin(angles.centerPathAngle) };

  return {
    cx: CENTER + x * HALFWAY_RADIUS,
    cy: CENTER + y * HALFWAY_RADIUS,
    deg: (angles.staffRotationAngle * 180) / Math.PI,
  };
}
