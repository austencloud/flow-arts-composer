import type { TipPoint } from "$lib/shared/animation-engine/domain/types/prop-tip-points";
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
