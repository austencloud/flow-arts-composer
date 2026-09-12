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
  "Both hands take the same number of turns on every step, and a mirrored dash spins the mirror way. Off, each hand rolls its own.";

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
