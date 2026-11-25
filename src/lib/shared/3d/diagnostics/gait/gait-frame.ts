/**
 * What the rig actually looks like, one frame at a time.
 *
 * Every number here is read off the live scene graph in world space AFTER the
 * whole animation pipeline has written its pose — mixer, then FootPlanter's
 * IK, then the arm pass. That is deliberate. The animator's own opinion about
 * which foot is down is the thing under test, so the probe never asks it; it
 * measures the pose on screen and works out contact geometrically.
 *
 * Plain objects, no three import, so the analysis on top of it stays a pure
 * function of numbers and can be tested without a renderer.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** One leg, as the rig is posing it right now. */
export interface FootFrame {
  /** Ankle joint (the Mixamo `Foot` bone). */
  ankle: Vec3;
  /** Ball of the foot (`ToeBase`), or null on a rig without one. */
  toe: Vec3 | null;
  /** Knee joint (`Leg`). */
  knee: Vec3;
  /** Hip joint (`UpLeg`) — the root of the two-bone IK chain. */
  hip: Vec3;
  /** Interior knee angle in degrees. 180 is a straight leg. */
  kneeAngle: number;
  /**
   * What the animator believes it is bearing, 0..1, or -1 when it has no
   * opinion. Recorded for comparison only — never used to decide stance.
   */
  claimedContact: number;
}

export interface GaitFrame {
  /** Seconds since the probe started recording. */
  t: number;
  /** Frame time in seconds. */
  dt: number;
  /** The commanded root — the position the movement system asked for. */
  root: Vec3;
  /** Facing in radians, as the movement system set it. */
  facing: number;
  /** Pelvis (`Hips`) world position — the stand-in for centre of mass. */
  hips: Vec3;
  left: FootFrame;
  right: FootFrame;
}

/** Which foot the geometry says is carrying the body. */
export type Support = "left" | "right" | "both" | "flight";

/** A contiguous run of frames where one foot was bearing weight. */
export interface Stance {
  foot: "left" | "right";
  startT: number;
  endT: number;
  /** Where the ankle first touched down, world XZ. */
  strike: Vec3;
  /** Where it left, world XZ. */
  release: Vec3;
  /**
   * Ground the contact point covered while it was supposed to be pinned, in
   * metres: per frame, the smaller move of heel (ankle) and ball, so a foot
   * rolling heel to toe is not charged for the roll.
   *
   * This is the single number that separates walking from gliding. A foot
   * bearing weight is a fixed point of the world; every centimetre here is a
   * centimetre the character skated.
   */
  slip: number;
  /**
   * How far the heel rose above the ball of the foot during the run, in
   * metres, taken at its worst. A heel that lifts at toe-off is correct; one
   * that lifts through mid-stance is the foot peeling off the floor.
   */
  peakHeelLift: number;
  /** Along-travel offset of the ankle behind the pelvis at peak heel lift. */
  heelLiftBehindHips: number;
  /** Ground speed of the root, averaged across the run. */
  rootSpeed: number;
}
