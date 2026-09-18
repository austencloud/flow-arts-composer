import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

export interface RailPropGlyphPresentation {
  scale: number;
  rotation: number;
  translateX: number;
  translateY: number;
}

const DEFAULT_PRESENTATION: RailPropGlyphPresentation = {
  scale: 1.42,
  rotation: 0,
  translateX: 0,
  translateY: 0,
};

/**
 * Extremely wide prop artwork carries more transparent space than round and
 * radial artwork. These optical scales equalize what the eye sees while the
 * rail's reserved box remains identical for every prop.
 */
const PRESENTATIONS: Partial<
  Record<PropType, Partial<RailPropGlyphPresentation>>
> = {
  [PropType.STAFF]: { scale: 1.4 },
  [PropType.SIMPLESTAFF]: { scale: 1.4 },
  [PropType.BIGSTAFF]: { scale: 1.62 },
  [PropType.STAFF2]: { scale: 1.48 },
  [PropType.CAPSULE_BATON]: { scale: 1.5 },
  [PropType.FIRE_DOUBLE_STAFF]: { scale: 1.52 },

  // The source club artwork is pivoted at the center with the whole club on
  // its right half. Stand it upright, then move that visible half back into
  // the optical center. Variants keep their own image; this only frames it.
  [PropType.CLUB]: { scale: 2.36, rotation: -90, translateY: 24 },
  [PropType.CLASSIC_CLUB]: { scale: 2.36, rotation: -90, translateY: 24 },
  [PropType.BIGCLUB]: { scale: 2.16, rotation: -90, translateY: 20 },

  // Fans are also authored from a center hand pivot into the right half.
  [PropType.FAN]: { scale: 1.92, translateX: -23 },
  [PropType.BIGFAN]: { scale: 1.72, translateX: -18 },

  [PropType.TRIAD]: { scale: 1.32 },
  [PropType.BIGTRIAD]: { scale: 1.32 },
  [PropType.MINIHOOP]: { scale: 1.38 },
  [PropType.BIGHOOP]: { scale: 1.72 },
  [PropType.TRIANGLE]: { scale: 1.38 },
  [PropType.BUUGENG]: { scale: 1.38 },
  [PropType.BIGBUUGENG]: { scale: 1.54 },
  [PropType.TRIGENG]: { scale: 1.3 },
  [PropType.HAND]: { scale: 1.1 },
  [PropType.TRIQUETRA]: { scale: 1.34 },
  [PropType.TRIQUETRA2]: { scale: 1.34 },
  [PropType.SWORD]: { scale: 1.54, rotation: -45 },
  [PropType.ENERGY_SABER]: { scale: 1.48, rotation: -45 },
  [PropType.ENERGY_STAFF]: { scale: 1.44 },
  [PropType.CHICKEN]: { scale: 1.9, rotation: -12 },
  [PropType.BIGCHICKEN]: { scale: 1.62 },
  [PropType.GUITAR]: { scale: 1.5, rotation: -40 },
  [PropType.UKULELE]: { scale: 1.62, rotation: -40 },
  [PropType.DOUBLESTAR]: { scale: 1.38 },
  [PropType.BIGDOUBLESTAR]: { scale: 1.42 },
  [PropType.EIGHTRINGS]: { scale: 1.42 },
  [PropType.BIGEIGHTRINGS]: { scale: 1.54 },
  [PropType.CONTACTBALL]: { scale: 1.48 },
  [PropType.BIGCONTACTBALL]: { scale: 1.48 },
  [PropType.DOUBLECONTACTBALL]: { scale: 1.46 },
  [PropType.BIGDOUBLECONTACTBALL]: { scale: 1.46 },
  [PropType.QUIAD]: { scale: 1.34 },
  [PropType.TORCH]: { scale: 1.88, rotation: -90, translateY: 22 },
  [PropType.BIGTORCH]: { scale: 1.72, rotation: -90, translateY: 20 },
  [PropType.POI]: { scale: 1.86, rotation: -90, translateY: 22 },
};

export function getRailPropGlyphPresentation(
  propType: PropType
): RailPropGlyphPresentation {
  return {
    ...DEFAULT_PRESENTATION,
    ...PRESENTATIONS[propType],
  };
}
