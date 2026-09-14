import { PropType } from "./enums/prop-type";
import { getBasePropType } from "./prop-type-display-registry";

/**
 * Transform parameters for one prop in a paired composition.
 * Coordinates are in a 0-100 viewBox space.
 */
export interface PropTransform {
  /** X position (0-100, center of viewBox) */
  x: number;
  /** Y position (0-100, center of viewBox) */
  y: number;
  /** Rotation in degrees */
  rotation: number;
  /** Scale factor (1 = natural size) */
  scale: number;
}

/**
 * A composition recipe defines how two props (blue + red) are arranged
 * to create an aesthetically pleasing paired preview.
 */
export interface CompositionRecipe {
  left: PropTransform;
  right: PropTransform;
  /** Overall scale applied to both props (shrinks the pair to fit the viewBox) */
  pairScale: number;
}

/**
 * Default composition recipes per base prop family.
 * These are starting points - tune in the Prop Button Lab tab.
 *
 * Each recipe assumes a viewBox of "0 0 100 100".
 * x/y are the center point of each prop image within that viewBox.
 */
// Fans: facing each other (beta-like). Big Fan is its own picker tile rather
// than a Fan variant, so it names the same recipe explicitly.
const FAN_RECIPE: CompositionRecipe = {
  left: { x: 35, y: 50, rotation: 0, scale: 0.45 },
  right: { x: 65, y: 50, rotation: 180, scale: 0.45 },
  pairScale: 1,
};

const FAMILY_RECIPES: Partial<Record<PropType, CompositionRecipe>> = {
  // Staves: crossed in an X
  [PropType.STAFF]: {
    left: { x: 50, y: 50, rotation: -45, scale: 0.55 },
    right: { x: 50, y: 50, rotation: 45, scale: 0.55 },
    pairScale: 1,
  },
  [PropType.FAN]: FAN_RECIPE,
  [PropType.BIGFAN]: FAN_RECIPE,
  // Clubs: angled V, handles meeting
  [PropType.CLUB]: {
    left: { x: 35, y: 50, rotation: -20, scale: 0.5 },
    right: { x: 65, y: 50, rotation: 20, scale: 0.5 },
    pairScale: 1,
  },
  // Buugengs: interlocked S-curves
  [PropType.BUUGENG]: {
    left: { x: 35, y: 50, rotation: 0, scale: 0.45 },
    right: { x: 65, y: 50, rotation: 180, scale: 0.45 },
    pairScale: 1,
  },
  // Hoops: overlapping circles (Venn)
  [PropType.MINIHOOP]: {
    left: { x: 38, y: 50, rotation: 0, scale: 0.5 },
    right: { x: 62, y: 50, rotation: 0, scale: 0.5 },
    pairScale: 1,
  },
  // Triads: rotational offset
  [PropType.TRIAD]: {
    left: { x: 38, y: 50, rotation: 0, scale: 0.45 },
    right: { x: 62, y: 50, rotation: 60, scale: 0.45 },
    pairScale: 1,
  },
  // Triquetras: interlocking geometry
  [PropType.TRIQUETRA]: {
    left: { x: 38, y: 50, rotation: 0, scale: 0.45 },
    right: { x: 62, y: 50, rotation: 60, scale: 0.45 },
    pairScale: 1,
  },
  // Chickens: mirrored pair
  [PropType.CHICKEN]: {
    left: { x: 35, y: 50, rotation: 10, scale: 0.45 },
    right: { x: 65, y: 50, rotation: -10, scale: 0.45 },
    pairScale: 1,
  },
  // Guitars: side by side, slight angle
  [PropType.GUITAR]: {
    left: { x: 35, y: 50, rotation: -15, scale: 0.45 },
    right: { x: 65, y: 50, rotation: 15, scale: 0.45 },
    pairScale: 1,
  },
  // Double Stars: overlapping offset
  [PropType.DOUBLESTAR]: {
    left: { x: 38, y: 50, rotation: 0, scale: 0.45 },
    right: { x: 62, y: 50, rotation: 30, scale: 0.45 },
    pairScale: 1,
  },
  // Eight Rings: side by side
  [PropType.EIGHTRINGS]: {
    left: { x: 38, y: 50, rotation: 0, scale: 0.45 },
    right: { x: 62, y: 50, rotation: 0, scale: 0.45 },
    pairScale: 1,
  },
  // Contact Balls: side by side (spheres)
  [PropType.CONTACTBALL]: {
    left: { x: 38, y: 50, rotation: 0, scale: 0.45 },
    right: { x: 62, y: 50, rotation: 0, scale: 0.45 },
    pairScale: 1,
  },
  // Torches: crossed
  [PropType.TORCH]: {
    left: { x: 50, y: 50, rotation: -30, scale: 0.5 },
    right: { x: 50, y: 50, rotation: 30, scale: 0.5 },
    pairScale: 1,
  },
  // Hand: mirrored pair (left/right hands)
  [PropType.HAND]: {
    left: { x: 35, y: 50, rotation: 0, scale: 0.45 },
    right: { x: 65, y: 50, rotation: 0, scale: 0.45 },
    pairScale: 1,
  },
  // Sword: crossed swords
  [PropType.SWORD]: {
    left: { x: 50, y: 50, rotation: -40, scale: 0.55 },
    right: { x: 50, y: 50, rotation: 40, scale: 0.55 },
    pairScale: 1,
  },
  // Energy Saber: crossed, matching its sword parent
  [PropType.ENERGY_SABER]: {
    left: { x: 50, y: 50, rotation: -40, scale: 0.55 },
    right: { x: 50, y: 50, rotation: 40, scale: 0.55 },
    pairScale: 1,
  },
  // Energy Staff: crossed in an X, matching its staff parent
  [PropType.ENERGY_STAFF]: {
    left: { x: 50, y: 50, rotation: -45, scale: 0.55 },
    right: { x: 50, y: 50, rotation: 45, scale: 0.55 },
    pairScale: 1,
  },
  // Quiad: side by side
  [PropType.QUIAD]: {
    left: { x: 38, y: 50, rotation: 0, scale: 0.45 },
    right: { x: 62, y: 50, rotation: 0, scale: 0.45 },
    pairScale: 1,
  },
  // Trigeng: facing each other
  [PropType.TRIGENG]: {
    left: { x: 35, y: 50, rotation: 0, scale: 0.45 },
    right: { x: 65, y: 50, rotation: 180, scale: 0.45 },
    pairScale: 1,
  },
};

/** Fallback recipe for any prop type not explicitly mapped */
const DEFAULT_RECIPE: CompositionRecipe = {
  left: { x: 35, y: 50, rotation: 10, scale: 0.45 },
  right: { x: 65, y: 50, rotation: -10, scale: 0.45 },
  pairScale: 1,
};

// These poses use the cropped navigation glyphs. Keep their silhouettes apart
// at 36px; symmetry alone can collapse two props into one unfamiliar symbol.
const COMPACT_RECIPES: Partial<Record<PropType, CompositionRecipe>> = {
  [PropType.FAN]: {
    left: { x: 29, y: 44, rotation: 180, scale: 0.38 },
    right: { x: 71, y: 56, rotation: 0, scale: 0.38 },
    pairScale: 1,
  },
  [PropType.CLUB]: {
    left: { x: 36, y: 49, rotation: -110, scale: 0.52 },
    right: { x: 64, y: 49, rotation: -70, scale: 0.52 },
    pairScale: 1,
  },
  [PropType.TORCH]: {
    left: { x: 37, y: 50, rotation: -120, scale: 0.54 },
    right: { x: 63, y: 50, rotation: -60, scale: 0.54 },
    pairScale: 1,
  },
  [PropType.BIGTORCH]: {
    left: { x: 37, y: 50, rotation: -120, scale: 0.54 },
    right: { x: 63, y: 50, rotation: -60, scale: 0.54 },
    pairScale: 1,
  },
  [PropType.TRIAD]: {
    left: { x: 27, y: 39, rotation: 0, scale: 0.32 },
    right: { x: 73, y: 61, rotation: 180, scale: 0.32 },
    pairScale: 1,
  },
  [PropType.TRIGENG]: {
    left: { x: 29, y: 41, rotation: 0, scale: 0.34 },
    right: { x: 71, y: 59, rotation: 180, scale: 0.34 },
    pairScale: 1,
  },
  [PropType.MINIHOOP]: {
    left: { x: 34, y: 39, rotation: 0, scale: 0.39 },
    right: { x: 66, y: 61, rotation: 180, scale: 0.39 },
    pairScale: 1,
  },
  [PropType.BUUGENG]: {
    left: { x: 30, y: 50, rotation: 90, scale: 0.5 },
    right: { x: 70, y: 50, rotation: 90, scale: 0.5 },
    pairScale: 1,
  },
  [PropType.HAND]: {
    left: { x: 27, y: 47, rotation: -5, scale: 0.36 },
    right: { x: 73, y: 53, rotation: 5, scale: 0.36 },
    pairScale: 1,
  },
  [PropType.TRIQUETRA]: {
    left: { x: 28, y: 42, rotation: 0, scale: 0.33 },
    right: { x: 72, y: 58, rotation: 180, scale: 0.33 },
    pairScale: 1,
  },
  [PropType.SWORD]: {
    left: { x: 50, y: 50, rotation: -130, scale: 0.59 },
    right: { x: 50, y: 50, rotation: -50, scale: 0.59 },
    pairScale: 1,
  },
  [PropType.ENERGY_SABER]: {
    left: { x: 50, y: 50, rotation: -130, scale: 0.59 },
    right: { x: 50, y: 50, rotation: -50, scale: 0.59 },
    pairScale: 1,
  },
  [PropType.CHICKEN]: {
    left: { x: 34, y: 50, rotation: -70, scale: 0.51 },
    right: { x: 66, y: 50, rotation: -110, scale: 0.51 },
    pairScale: 1,
  },
  [PropType.GUITAR]: {
    left: { x: 36, y: 50, rotation: 110, scale: 0.51 },
    right: { x: 64, y: 50, rotation: 70, scale: 0.51 },
    pairScale: 1,
  },
  [PropType.DOUBLESTAR]: {
    left: { x: 29, y: 46, rotation: 90, scale: 0.47 },
    right: { x: 71, y: 54, rotation: 90, scale: 0.47 },
    pairScale: 1,
  },
  [PropType.EIGHTRINGS]: {
    left: { x: 29, y: 46, rotation: 90, scale: 0.47 },
    right: { x: 71, y: 54, rotation: 90, scale: 0.47 },
    pairScale: 1,
  },
  [PropType.QUIAD]: {
    left: { x: 33, y: 36, rotation: 0, scale: 0.36 },
    right: { x: 67, y: 64, rotation: 0, scale: 0.36 },
    pairScale: 1,
  },
  [PropType.CONTACTBALL]: {
    left: { x: 27, y: 43, rotation: 0, scale: 0.29 },
    right: { x: 73, y: 57, rotation: 0, scale: 0.29 },
    pairScale: 1,
  },
  [PropType.DOUBLECONTACTBALL]: {
    left: { x: 50, y: 29, rotation: 0, scale: 0.47 },
    right: { x: 50, y: 71, rotation: 0, scale: 0.47 },
    pairScale: 1,
  },
  [PropType.BIGDOUBLECONTACTBALL]: {
    left: { x: 50, y: 29, rotation: 0, scale: 0.47 },
    right: { x: 50, y: 71, rotation: 0, scale: 0.47 },
    pairScale: 1,
  },
  [PropType.POI]: {
    left: { x: 33, y: 49, rotation: 110, scale: 0.52 },
    right: { x: 67, y: 49, rotation: 70, scale: 0.52 },
    pairScale: 1,
  },
};

/**
 * Gets the composition recipe for a prop type.
 * Variants inherit from their base family.
 */
export function getCompositionRecipe(
  propType: PropType,
  compact = false
): CompositionRecipe {
  const base = getBasePropType(propType);
  if (compact)
    return (
      COMPACT_RECIPES[propType] ??
      COMPACT_RECIPES[base] ??
      FAMILY_RECIPES[propType] ??
      FAMILY_RECIPES[base] ??
      DEFAULT_RECIPE
    );
  return FAMILY_RECIPES[base] ?? FAMILY_RECIPES[propType] ?? DEFAULT_RECIPE;
}

/**
 * All base prop types that have explicit recipes.
 * Used by the lab tab to display all configurable families.
 */
export function getRecipeFamilies(): {
  propType: PropType;
  recipe: CompositionRecipe;
}[] {
  return Object.keys({ ...FAMILY_RECIPES, ...COMPACT_RECIPES }).map((key) => ({
    propType: key as PropType,
    recipe: getCompositionRecipe(key as PropType, true),
  }));
}
