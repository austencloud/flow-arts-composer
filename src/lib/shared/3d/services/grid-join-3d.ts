import type { Plane } from "@austencloud/scene-3d";
import {
  alignGridJoin,
  gridJoinOffsets,
  isGridJoin,
  type GridJoinSpec,
} from "@tka/render-core";
import { LOCATION_ANGLES } from "#lib/shared/foundation/domain/math-constants.js";
import { planeAngleToWorldPosition } from "../domain/constants/plane-transforms";
import {
  DEFAULT_HAND_DISTANCE,
  type HandDistance,
} from "../domain/performer-hand-distance";

/** Resolve the one sequence-wide join against the same grid mode its cells draw. */
export function resolveGridJoin3D(
  sequence:
    | {
        readonly conjoined?: unknown;
        readonly gridMode?: unknown;
        readonly startPlacement?: { readonly gridMode?: unknown } | null;
        readonly startingPlacement?: { readonly gridMode?: unknown } | null;
        readonly steps?: readonly { readonly gridMode?: unknown }[];
      }
    | null
    | undefined
): GridJoinSpec | null {
  if (!sequence || !isGridJoin(sequence.conjoined)) return null;
  const gridMode = [
    sequence.gridMode,
    sequence.startPlacement?.gridMode,
    sequence.startingPlacement?.gridMode,
    sequence.steps?.[0]?.gridMode,
  ].find((mode): mode is string => typeof mode === "string");
  return alignGridJoin(sequence.conjoined, gridMode ?? null);
}

/** Offset of a hand's grid center in the motion plane, in world meters. */
export function gridJoinOffset3D(
  join: GridJoinSpec | null | undefined,
  hand: "left" | "right",
  plane: Plane,
  handDistance: HandDistance = DEFAULT_HAND_DISTANCE
) {
  if (!isGridJoin(join)) return planeAngleToWorldPosition(plane, 0, 0);

  // Sample the reach toward the other grid. This keeps the join anchored to
  // each performer's directional hand distance rather than a fixed grid size.
  const toward = LOCATION_ANGLES[join.toward];
  const inwardAngle = hand === "left" ? toward : toward + Math.PI;
  const radius = handDistance.toward(plane, inwardAngle);
  const offset = gridJoinOffsets(join, radius)[hand];
  return planeAngleToWorldPosition(
    plane,
    Math.atan2(offset.y, offset.x),
    Math.hypot(offset.x, offset.y)
  );
}
