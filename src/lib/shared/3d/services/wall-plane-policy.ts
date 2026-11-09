/**
 * The viewer's side of the wall-plane feasibility verdict. The offline scan
 * writes `metadata.wallFeasibility`; this turns it into a plane policy and
 * stamps "withCheat" overrides onto the step configs the viewer builds.
 *
 * Kept free of the collision model (scanner, StanceSimulator) on purpose:
 * the viewer imports this at load time, the solvers import it offline.
 */
import { Plane } from "@austencloud/scene-3d";
import { MotionType } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { MotionConfig3D } from "../domain/models/motion-data-3d";
import {
  SCAN_VERSION,
  type WallFeasibilityMetadata,
  type WallPlaneStepOverride,
} from "../domain/models/wall-feasibility";
import type { StepMotionConfigs } from "./sequence-converter";

export interface StepMotionPair {
  left: MotionConfig3D;
  right: MotionConfig3D;
}

/**
 * Which hands may be cheated off the plain wall path. The concavity and depth
 * solvers share this predicate, so pro conflicts bail in both.
 */
export function concaveEligible(m: MotionConfig3D): boolean {
  return m.motionType === MotionType.ANTI || m.pathShape === "concave";
}

export function withDepth(m: MotionConfig3D, k: number): MotionConfig3D {
  return concaveEligible(m)
    ? { ...m, pathShape: "concave", concaveDepth: k }
    : m;
}

export function withZ(m: MotionConfig3D, z: number): MotionConfig3D {
  return z === 0 ? m : { ...m, depthOffset: z };
}

export interface PlanePolicy {
  /** Verdict false: the flat wall render collides, dual wheel is the fallback. */
  preferDualWheel: boolean;
  /** Verdict "withCheat" from this scanner version: stamp its overrides. */
  applyOverrides: boolean;
}

/**
 * Unscanned (absent) means today's behavior and no claims. A version skew
 * still honors the plane verdict but never the overrides, which were tuned
 * against another model.
 */
export function resolvePlanePolicy(
  meta: WallFeasibilityMetadata | undefined
): PlanePolicy {
  return {
    preferDualWheel: meta?.wallFeasible === false,
    applyOverrides:
      meta?.wallFeasible === "withCheat" && meta.scanVersion === SCAN_VERSION,
  };
}

/**
 * Stamp a "withCheat" step's overrides onto its hand configs. Overrides
 * written by another scanner version are ignored.
 */
export function applyWallPlaneOverrides(
  step: StepMotionPair,
  stepIndex: number,
  meta: WallFeasibilityMetadata | undefined
): StepMotionPair {
  if (!resolvePlanePolicy(meta).applyOverrides) return step;
  const entry = meta?.wallPlaneOverrides?.[stepIndex];
  if (!entry) return step;
  const stamp = (m: MotionConfig3D, o: WallPlaneStepOverride | undefined) => {
    if (!o) return m;
    let out = o.depthOffset !== undefined ? withZ(m, o.depthOffset) : m;
    if (o.k !== undefined) out = withDepth(out, o.k);
    return out;
  };
  return {
    left: stamp(step.left, entry.left),
    right: stamp(step.right, entry.right),
  };
}

/**
 * The conversion seam for a whole sequence: `configs` must be in
 * sequenceToMotionConfigs order (start placement excluded), the order the
 * scan script keys its overrides by. A step is stamped only while both hands
 * are still on the wall plane the scan assumed; a hand moved to wheel (mode
 * switch or per-beat override) gets nothing. Returns `configs` itself when
 * nothing applies.
 */
export function applyWallFeasibility(
  configs: StepMotionConfigs[],
  meta: WallFeasibilityMetadata | undefined
): StepMotionConfigs[] {
  if (!resolvePlanePolicy(meta).applyOverrides) return configs;
  return configs.map((c, i) => {
    if (!c.left || !c.right) return c;
    if (c.left.plane !== Plane.WALL || c.right.plane !== Plane.WALL) return c;
    const s = applyWallPlaneOverrides(
      { left: c.left, right: c.right },
      i,
      meta
    );
    return s.left === c.left && s.right === c.right
      ? c
      : { ...c, left: s.left, right: s.right };
  });
}
