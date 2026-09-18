import type { TipPoint } from "$lib/shared/animation-engine/domain/types/prop-tip-points";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

/** The prop in each hand. Equal hands are the ordinary single-prop matrix. */
export interface ShapeMatrixPropPair {
  left: PropType;
  right: PropType;
}

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
