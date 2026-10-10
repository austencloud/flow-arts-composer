/**
 * TkaPoseClassifier — staff pose streams -> TKA notation attributes.
 *
 * SIGN CONVENTIONS (MCP-grounded 2026-07-05 against the Flow Arts Knowledge
 * server; do not re-derive these from intuition):
 * - Grid frame: X = East, Y = North; location angle = atan2(x, y) measured
 *   CLOCKWISE from North. "Clockwise" in TKA = the N -> E -> S -> W direction
 *   as drawn on the grid (glossary: "clockwise").
 * - In the X=East/Y=North frame, math-positive angles (atan2 increasing) are
 *   COUNTER-clockwise. All accumulated angles here are signed CCW-positive;
 *   `additional >= 0` therefore maps to RotationDirection.COUNTER_CLOCKWISE.
 * - Orientation is CENTER-RELATIVE (topic: center-relative-orientation):
 *   in = prop faces toward center, out = away, clock/counter = perpendicular,
 *   facing the clockwise/counter-clockwise direction of travel. The clockwise
 *   tangent at radial direction (rx, ry) is (ry, -rx).
 * - 1 turn = 180 degrees of ADDITIONAL prop rotation beyond the motion's base
 *   rotation (topic: base-rotation). Pro base = rotates with the arc
 *   (+arcAngle, preserves center-relative orientation); anti base = against
 *   (-arcAngle, reverses it); dash/static/float have zero base rotation.
 * - Float holds absolute spatial angle during a shift (net spatial rotation
 *   ~0) and carries no turn count — it renders as turns 'fl'.
 *
 * CAMERA-MIRROR CAVEAT: whether the video's screen-right is the performer's
 * East or West depends on camera facing. The validation scorecard tests both
 * hypotheses (see validation/scorecard.ts mirrorBeatNotation); resolve it
 * against the first real ground-truth clip, not by assumption.
 */
import { Vector3 } from "three";
import type { GridLocation } from "../domain/models";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  Orientation,
  MotionType,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type {
  StaffHand,
  StaffPose3D,
  StaffMotionNotation,
} from "../domain/notation-3d";

/** 8 grid locations ordered clockwise from North at 45deg steps. */
const LOCATIONS: GridLocation[] = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
const CARDINALS = new Set<GridLocation>(["n", "e", "s", "w"]);

export interface ClassifierConfig {
  /** Round turns to this increment. 0.5 = half-turn (L3); 0.25 = quarter (L4). */
  turnIncrement: number;
  /** |cos angle| above this = radial (in/out); below = nonradial (clock/counter). */
  radialDotThreshold: number;
}

export const DEFAULT_CLASSIFIER_CONFIG: ClassifierConfig = {
  turnIncrement: 0.5,
  radialDotThreshold: 0.707, // 45deg split between radial and nonradial
};

export class TkaPoseClassifier {
  constructor(private config: ClassifierConfig = DEFAULT_CLASSIFIER_CONFIG) {}

  /** Nearest of the 8 grid locations for a grip position (XY plane, Z ignored). */
  classifyLocation(gripPos: Vector3): GridLocation {
    // Clockwise angle from North: atan2(East, North).
    const theta = Math.atan2(gripPos.x, gripPos.y); // (-PI, PI], 0 = North
    const deg = ((theta * 180) / Math.PI + 360) % 360;
    const bucket = Math.round(deg / 45) % 8;
    return LOCATIONS[bucket]!;
  }

  /** Diamond when at least one end is cardinal; box when both intercardinal. */
  gridModeFor(a: GridLocation, b: GridLocation): GridMode {
    const cardinalCount =
      (CARDINALS.has(a) ? 1 : 0) + (CARDINALS.has(b) ? 1 : 0);
    return cardinalCount >= 1 ? GridMode.DIAMOND : GridMode.BOX;
  }

  /**
   * Orientation of the shaft relative to the radius at its grid location.
   * Radial (|radialDot| >= threshold): OUT if pointing away from center, IN if toward.
   * Nonradial: CLOCK if the in-plane shaft points clockwise-tangent, COUNTER otherwise.
   */
  classifyOrientation(gripPos: Vector3, axisDir: Vector3): Orientation {
    const radial = new Vector3(gripPos.x, gripPos.y, 0);
    if (radial.lengthSq() < 1e-9) return Orientation.OUT; // degenerate (at center)
    radial.normalize();
    const axis2d = new Vector3(axisDir.x, axisDir.y, 0);
    if (axis2d.lengthSq() < 1e-9) return Orientation.OUT; // shaft straight at camera
    axis2d.normalize();

    const radialDot = axis2d.dot(radial); // +1 = out, -1 = in
    if (Math.abs(radialDot) >= this.config.radialDotThreshold) {
      return radialDot >= 0 ? Orientation.OUT : Orientation.IN;
    }
    // Nonradial: clockwise tangent at a location = (radial.y, -radial.x).
    const tangentCW = new Vector3(radial.y, -radial.x, 0);
    return axis2d.dot(tangentCW) >= 0 ? Orientation.CLOCK : Orientation.COUNTER;
  }

  /** Angular separation (0..4, in 45deg units) between two grid locations. */
  private locStep(a: GridLocation, b: GridLocation): number {
    const ia = LOCATIONS.indexOf(a);
    const ib = LOCATIONS.indexOf(b);
    const raw = Math.abs(ia - ib) % 8;
    return Math.min(raw, 8 - raw); // 0..4
  }

  /** Hand-path family: same->static, opposite(4 steps)->dash, else->shift. */
  classifyHandMotion(
    start: GridLocation,
    end: GridLocation
  ): "static" | "shift" | "dash" {
    const step = this.locStep(start, end);
    if (step === 0) return "static";
    if (step === 4) return "dash";
    return "shift";
  }

  /**
   * Shift prop type from the arc direction vs the prop's net spatial rotation.
   * Both signed CCW-positive radians. With-arc = pro, against = anti, ~0 spin = float.
   * Float band = a small absolute-rotation deadzone (the -0.5-turn boundary).
   */
  classifyShiftType(arcAngle: number, propNetRotation: number): MotionType {
    const FLOAT_BAND = Math.PI / 4; // < 45deg net spin over a shift = float
    if (Math.abs(propNetRotation) < FLOAT_BAND) return MotionType.FLOAT;
    return Math.sign(propNetRotation) === Math.sign(arcAngle)
      ? MotionType.PRO
      : MotionType.ANTI;
  }

  /** Round a turn count to the configured increment (default 0.5). */
  private roundTurns(raw: number): number {
    const inc = this.config.turnIncrement;
    return Math.round(raw / inc) * inc;
  }

  /** Base prop rotation inherent to a motion type, signed CCW-positive. */
  private baseRotation(motionType: MotionType, arcAngle: number): number {
    switch (motionType) {
      case MotionType.PRO:
        return arcAngle; // preserves orientation
      case MotionType.ANTI:
        return -arcAngle; // reverses orientation
      default:
        return 0; // dash, static, float
    }
  }

  /**
   * Full per-staff notation across a beat pair.
   * @param arcAngle signed CCW-positive hand-arc rotation about center (shift only; 0 otherwise)
   * @param propNetRotation signed CCW-positive net prop spin over the span
   * @param confidence lowest per-frame tracking confidence over the span
   */
  classifyMotion(
    hand: StaffHand,
    start: StaffPose3D,
    end: StaffPose3D,
    arcAngle: number,
    propNetRotation: number,
    confidence: number
  ): StaffMotionNotation {
    const startLocation = this.classifyLocation(start.gripPos);
    const endLocation = this.classifyLocation(end.gripPos);
    const handMotion = this.classifyHandMotion(startLocation, endLocation);

    let motionType: MotionType;
    if (handMotion === "static") motionType = MotionType.STATIC;
    else if (handMotion === "dash") motionType = MotionType.DASH;
    else motionType = this.classifyShiftType(arcAngle, propNetRotation);

    const additional =
      propNetRotation - this.baseRotation(motionType, arcAngle);
    const turns =
      motionType === MotionType.FLOAT
        ? 0 // float has no turn count
        : this.roundTurns(Math.abs(additional) / Math.PI);

    let rotationDirection: RotationDirection;
    if (turns === 0 || motionType === MotionType.FLOAT) {
      rotationDirection = RotationDirection.NO_ROTATION;
    } else {
      rotationDirection =
        additional >= 0
          ? RotationDirection.COUNTER_CLOCKWISE
          : RotationDirection.CLOCKWISE;
    }

    return {
      hand,
      startLocation,
      endLocation,
      handMotion,
      motionType,
      rotationDirection,
      turns,
      startOrientation: this.classifyOrientation(start.gripPos, start.axisDir),
      endOrientation: this.classifyOrientation(end.gripPos, end.axisDir),
      confidence,
    };
  }
}
