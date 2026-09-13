/**
 * How the left hand relates to the right hand inside each generated step.
 *
 * This is the app's vocabulary for the engine's HandRelationshipConstraint.
 * It sits beside generation-style.ts but is not part of GenerationStylePolicy:
 * Generate is the only surface that offers it, so Fuse and the public Composer
 * demo keep their untouched recipe unchanged.
 *
 * Turns, floats, orientations and dash spin stay independent per hand unless
 * "Match turns" is on. The relationship itself is about hand paths and motion
 * types only; matching turns is the separate toggle that completes the mirror.
 */
import type {
  HandRelationshipMap,
  HandRelationshipOptions,
} from "@tka/sequence-engine/generation";
import type { ReflectionAxis } from "@tka/sequence-engine/loop";
import {
  ElementalType,
  TnDMode,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { TND_TO_ELEMENTAL } from "$lib/shared/pictograph/shared/domain/utils/tnd-calculator";

export type HandRelationship =
  | "free"
  | "mirrored"
  | "flipped"
  | "unison"
  | "opposite";

export const HAND_RELATIONSHIPS: readonly HandRelationship[] = [
  "free",
  "mirrored",
  "flipped",
  "unison",
  "opposite",
];

export const DEFAULT_HAND_RELATIONSHIP: HandRelationship = "free";

export function isHandRelationship(value: unknown): value is HandRelationship {
  return (
    typeof value === "string" &&
    (HAND_RELATIONSHIPS as readonly string[]).includes(value)
  );
}

/**
 * The LOOP reflection axis a reflection relationship keeps. Mirrored and
 * Flipped only survive LOOP transforms that commute with them: rotate 180,
 * the two cardinal reflections, swap, invert, rewind. A 90-degree rotation or
 * a diagonal axis does not, and resolveLoopConfig coerces those to this axis.
 * Null for Free, Unison and Opposite, which commute with every LOOP.
 */
export function relationshipReflectionAxis(
  relationship: HandRelationship
): ReflectionAxis | null {
  if (relationship === "mirrored") return "north-south";
  if (relationship === "flipped") return "east-west";
  return null;
}

const ENGINE_MAP: Record<
  Exclude<HandRelationship, "free">,
  HandRelationshipMap
> = {
  mirrored: "reflect-north-south",
  flipped: "reflect-east-west",
  unison: "identity",
  opposite: "rotate-180",
};

/** The engine option for a relationship, or undefined for Free. */
export function handRelationshipToEngine(
  relationship: HandRelationship,
  inverted: boolean
): HandRelationshipOptions | undefined {
  if (relationship === "free") return undefined;
  return { map: ENGINE_MAP[relationship], inverted };
}

/**
 * Each relationship is one VTG timing and direction quadrant, in both grids
 * (hand-relationship-tnd.test.ts reads the dataframes to prove it).
 * Direction: a reflection reverses one hand's arc, so Mirrored and Flipped
 * are opposite; identity and the 180 turn keep it, so Unison and Opposite are
 * same. Timing: the N-S mirror and identity keep South fixed, so both hands
 * reach the downbeat together; the E-W flip and the 180 turn swap North and
 * South, so the hands are half a cycle apart. The 90-degree rotations and the
 * diagonal reflections would be the quarter-time pair (Sun, Moon).
 */
export const HAND_RELATIONSHIP_TND: Record<
  Exclude<HandRelationship, "free">,
  TnDMode
> = {
  mirrored: TnDMode.TOG_OPP,
  flipped: TnDMode.SPLIT_OPP,
  unison: TnDMode.TOG_SAME,
  opposite: TnDMode.SPLIT_SAME,
};

/** The element a relationship reads as, via the app's own T&D table. */
export function handRelationshipElement(
  relationship: HandRelationship
): ElementalType | null {
  if (relationship === "free") return null;
  return TND_TO_ELEMENTAL[HAND_RELATIONSHIP_TND[relationship]];
}

/** Row tag wording: "Together, opposite". */
export const TND_ROW_LABELS: Record<TnDMode, string> = {
  [TnDMode.TOG_OPP]: "Together, opposite",
  [TnDMode.SPLIT_OPP]: "Split, opposite",
  [TnDMode.TOG_SAME]: "Together, same",
  [TnDMode.SPLIT_SAME]: "Split, same",
  [TnDMode.QUARTER_SAME]: "Quarter, same",
  [TnDMode.QUARTER_OPP]: "Quarter, opposite",
};

export const ELEMENT_ROW_LABELS: Record<ElementalType, string> = {
  [ElementalType.AIR]: "Air",
  [ElementalType.FIRE]: "Fire",
  [ElementalType.EARTH]: "Earth",
  [ElementalType.WATER]: "Water",
  [ElementalType.SUN]: "Sun",
  [ElementalType.MOON]: "Moon",
};

export const HAND_RELATIONSHIP_LABELS: Record<HandRelationship, string> = {
  free: "Free",
  mirrored: "Mirrored",
  flipped: "Flipped",
  unison: "Unison",
  opposite: "Opposite",
};

export const HAND_RELATIONSHIP_HINTS: Record<HandRelationship, string> = {
  free: "Each hand is chosen on its own.",
  mirrored:
    "The left hand traces the mirror image of the right, side to side.",
  flipped:
    "The left hand traces the mirror image of the right, top to bottom.",
  unison: "Both hands move through the same point in the same direction.",
  opposite: "Hands stay across from each other and arc the same way.",
};

export const HAND_RELATIONSHIP_INVERTED_HINT =
  "The left hand uses the other motion type. Pro on the right is anti on the left.";

export const MATCH_HAND_TURNS_LABEL = "Match turns";

export const MATCH_HAND_TURNS_HINT =
  "Both hands take the same turns on every step, and a mirrored dash spins the mirror way.";

export const MATCH_HAND_TURNS_LEVEL_HINT = "Level 1 has no turns to match.";

/**
 * Row and summary wording: "Free", "Mirrored", "Mirrored, inverted",
 * "Mirrored, inverted, matched turns".
 */
export function describeHandRelationship(
  relationship: HandRelationship,
  inverted: boolean,
  matchTurns = false
): string {
  const parts = [HAND_RELATIONSHIP_LABELS[relationship]];
  if (relationship !== "free" && inverted) parts.push("inverted");
  if (matchTurns) parts.push("matched turns");
  return parts.join(", ");
}
