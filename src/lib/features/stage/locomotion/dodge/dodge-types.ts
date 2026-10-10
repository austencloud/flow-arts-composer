
/**
 * SweepSample/SweptVolume now live in shared 3D services (see
 * src/lib/shared/3d/services/swept-volume/types.ts) so a feasibility scanner
 * outside the dodge lab can consume them without depending on dodge internals.
 * Re-exported here so existing dodge-lab importers keep resolving unchanged.
 */
export type { SweepSample, SweptVolume } from "#lib/shared/3d/services/swept-volume/types.js";

/** Which way the body bails. `auto` derives the side from the sweep direction. */
export type DodgeSide = "auto" | "left" | "right";

/** Art-direction knob for the analytic vacate. */
export interface DodgeKnob {
  side: DodgeSide;
  /** 0 = just-clears the prop, 1 = full comfortable step. */
  aggression: number;
}

export const DEFAULT_DODGE_KNOB: DodgeKnob = { side: "auto", aggression: 0.6 };

/**
 * A solved body placement for one instant of the dodge, in the same floor/world
 * XZ frame the rig's foot offset + root yaw already use. Pure stance — the arms
 * are pinned separately by the driver's IK.
 */
export interface BodyPlacement {
  footOffsetX: number;
  footOffsetZ: number;
  rootYawRad: number;
  torsoTwistRad: number;
  spinePitchRad: number;
}

/**
 * The runtime dodge plan: a deterministic placement function over sweep
 * progress [0,1], plus diagnostics. Replaces the optimized trajectory — the
 * driver calls `placement(progress)` each frame (cheap, no numeric search).
 */
export interface DodgePlan {
  placement(progress: number): BodyPlacement;
  knob: DodgeKnob;
  /** Worst torso penetration into the swept tube across the sweep (m). */
  worstBodyDepth: number;
  /** True when the torso clears the tube at every sampled instant. */
  feasible: boolean;
}
