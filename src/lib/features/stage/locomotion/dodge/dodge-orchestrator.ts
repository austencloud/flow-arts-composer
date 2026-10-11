
import { restPoseFromHeight } from "#lib/features/lab/tabs/collision-lab/services/stance-simulator.js";
import type { RestPoseGeometry } from "#lib/features/lab/tabs/collision-lab/services/types.js";
import type { MotionConfig3D } from "#lib/shared/3d/domain/models/motion-data-3d.js";
import { buildSweptVolume } from "./swept-volume-builder";
import { SweptTube } from "./swept-tube";
import { planVacate } from "./dodge-vacate-planner";
import { DEFAULT_DODGE_KNOB, type DodgeKnob, type DodgePlan } from "./dodge-types";

/**
 * Plan the dodge analytically: sample both hands' swept tubes, then run the
 * VacatePlanner to a single deterministic clearing stance. No StanceOptimizer,
 * no trajectory search — the returned `placement` is a pure function of sweep
 * progress (held stance in v1), so the live rig never jitters. The StanceOptimizer
 * and StanceSimulator stay in the collision lab for offline candidate labeling;
 * they are no longer on the dodge runtime path.
 */
export function planDodge(
  leftConfig: MotionConfig3D,
  rightConfig: MotionConfig3D,
  heightMeters = 1.8,
  sampleCount = 24,
  restPoseOverride?: RestPoseGeometry,
  knob: DodgeKnob = DEFAULT_DODGE_KNOB,
): DodgePlan {
  const leftTube = new SweptTube(buildSweptVolume(leftConfig, sampleCount).samples);
  const rightTube = new SweptTube(buildSweptVolume(rightConfig, sampleCount).samples);
  const body = restPoseOverride ?? restPoseFromHeight(heightMeters);
  const res = planVacate(leftTube, rightTube, body, knob);
  return {
    placement: () => res.placement,
    knob,
    worstBodyDepth: res.worstBodyDepth,
    feasible: res.feasible,
  };
}
