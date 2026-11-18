/**
 * The five LOOP types the page names, in the order it tours them, and the
 * four lines a Reflected LOOP can reflect across.
 */
import { LOOPComponent } from "#lib/shared/foundation/domain/models/generation/generate-models.js";

export const TYPE_ORDER = [
  "rotated",
  "reflected",
  "swapped",
  "inverted",
  "rewound",
] as const;
export type TypeKind = (typeof TYPE_ORDER)[number];

/** The app's icon and colour for each type. */
export const COMPONENT_OF: Record<TypeKind, LOOPComponent> = {
  rotated: LOOPComponent.ROTATED,
  // The app's icon for the left-right reflection.
  reflected: LOOPComponent.MIRRORED,
  swapped: LOOPComponent.SWAPPED,
  inverted: LOOPComponent.INVERTED,
  rewound: LOOPComponent.REWOUND,
};

/** The four reflection lines (engine axis names): left-right, top-bottom,
 *  then the two diagonals. */
export const REFLECTION_AXES = [
  "north-south",
  "east-west",
  "northeast-southwest",
  "northwest-southeast",
] as const;
export type ReflectionLine = (typeof REFLECTION_AXES)[number];
