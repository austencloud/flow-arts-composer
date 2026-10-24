import type { PerformerHandDistance } from "./performer-hand-distance";
import { scalePerformerHandDistance3D } from "../services/grid-join-3d";
import type { PerformerReachMeasurements } from "./performer-reach-measurements";

/** Standalone capture fits the body; Composer capture follows the live viewer. */
export type CaptureReachInputPolicy = "measured" | "viewer";

/** The live viewer passes an effective orbit; the rig state applies its join scale internally. */
export function handDistanceBaseForRig(
  hands: PerformerHandDistance,
  gridScale: number,
  alreadyEffective: boolean
): PerformerHandDistance {
  return alreadyEffective
    ? scalePerformerHandDistance3D(hands, 1 / gridScale)
    : hands;
}

/**
 * The pattern keeps the Composer's grid on every body. A hand that cannot
 * reach its staff is solved per beat by the contact planner, which turns the
 * chest and moves only the staffs that need it; shrinking the whole orbit to
 * the crossed-arms worst case left about 7 cm of grid on the cast rigs.
 */
export function captureReachInputs(
  policy: CaptureReachInputPolicy,
  hands: PerformerHandDistance,
  measurements: PerformerReachMeasurements | null
): {
  hands: PerformerHandDistance;
  measurements: PerformerReachMeasurements | null;
} {
  return { hands, measurements: policy === "viewer" ? null : measurements };
}
