import {
  getTipPoints,
  type TipPoint,
} from "$lib/shared/animation-engine/domain/types/prop-tip-points";
import { getDefaultTrailPointConfig } from "$lib/shared/animation-engine/domain/types/trail-point-types";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

/** The prop in each hand. Equal hands are the ordinary single-prop matrix. */
export interface ShapeMatrixPropPair {
  left: PropType;
  right: PropType;
}

/** The hand a prop picker addresses while cat dog is on. */
export type ShapeMatrixPropHand = "left" | "right";

/** The tracked source point inside each hand's own prop artwork. */
export interface ShapeMatrixTipPair {
  left: TipPoint;
  right: TipPoint;
}

/** Each hand's radial reach to its tracked source, in prop-dimension units. */
export interface ShapeMatrixReachPair {
  left: number;
  right: number;
}

/** One prop names both hands; a pair is taken as given. */
export function asPropPair(
  props: PropType | ShapeMatrixPropPair
): ShapeMatrixPropPair {
  return typeof props === "string" ? { left: props, right: props } : props;
}

/**
 * Older saves and settings carry one `propType`. Each hand reads its own field
 * first; the left falls back to that prop, the right to the left.
 */
export function propPairFromLegacy(source: {
  propType?: PropType;
  leftPropType?: PropType;
  rightPropType?: PropType;
}): ShapeMatrixPropPair {
  const left = source.leftPropType ?? source.propType ?? PropType.STAFF;
  return { left, right: source.rightPropType ?? left };
}

/**
 * True when the Shape Engine can trace a path for this prop. `build()` in
 * shape-matrix-flowers.ts throws when a prop has no tracked source point at
 * all (bare hands, a single contact ball) -- this mirrors the same tip
 * lookup, without importing the services layer, so a caller can steer around
 * that failure before it happens.
 */
function hasTracedShapeMatrixSource(propType: PropType): boolean {
  const points = getTipPoints(propType).points;
  return getDefaultTrailPointConfig(propType, points).right.type !== "none";
}

/**
 * A prop the Shape Engine cannot trace folds to staff, so a caller that reads
 * the pair from outside the engine (app settings, a persisted snapshot, a
 * shared URL) never hands it one that would leave the Create tab's matrix
 * permanently stuck on "could not be built". The fold is draw-only: it never
 * writes back to wherever the pair came from, so the user's actual choice of
 * bare hand or contact ball stays exactly as they set it.
 */
export function foldUntraceableProp(propType: PropType): PropType {
  return hasTracedShapeMatrixSource(propType) ? propType : PropType.STAFF;
}

/** The pair-level version of {@link foldUntraceableProp}, one hand at a time. */
export function foldUntraceablePropPair(
  pair: ShapeMatrixPropPair
): ShapeMatrixPropPair {
  return {
    left: foldUntraceableProp(pair.left),
    right: foldUntraceableProp(pair.right),
  };
}
