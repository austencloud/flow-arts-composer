/**
 * Timing and direction for the hands and for the props inside each generated
 * step. This is the app's vocabulary for the engine's HandRelationshipConstraint
 * and PropRelationshipConstraint.
 *
 * A selection is Free or one of the six VTG modes (TS, TO, SS, SO, QS, QO):
 * the first letter is timing (Together, Split, Quarter), the second is
 * direction (Same, Opposite). Hands and props are independent selections. The
 * engine's inverted flag is no longer a user input; it is derived from the
 * pair (see deriveHandInversion).
 *
 * Generate is the only surface that offers these, so Fuse and the public
 * Composer demo keep their untouched recipe unchanged.
 */
import {
  HAND_RELATIONSHIP_LOCATION_MAPS,
  isReflectionMap,
  type HandRelationshipMap,
  type HandRelationshipOptions,
  type PropRelationshipOptions,
} from "@tka/sequence-engine/generation";
import type { ReflectionAxis } from "@tka/sequence-engine/loop";
import {
  MODE_ORDER,
  MODE_WORDS,
  type VtgMode,
} from "$lib/shared/shape-matrix/services/shape-matrix-realizations";

export type TnDSelection = "free" | VtgMode;

export const TND_SELECTIONS: readonly TnDSelection[] = ["free", ...MODE_ORDER];

export const DEFAULT_TND_SELECTION: TnDSelection = "free";

export function isTnDSelection(value: unknown): value is TnDSelection {
  return (
    typeof value === "string" &&
    (TND_SELECTIONS as readonly string[]).includes(value)
  );
}

/**
 * The four names Generate used before the TnD card. Each was one quadrant
 * (hand-relationship-tnd.test.ts reads the dataframes to prove it), so a
 * stored config migrates without loss.
 */
export const LEGACY_HAND_RELATIONSHIP_MODES: Readonly<Record<string, VtgMode>> =
  {
    mirrored: "TO",
    flipped: "SO",
    unison: "TS",
    opposite: "SS",
  };

/**
 * The engine maps that realize each hand mode. Direction: a reflection
 * reverses one hand's arc, so the Opposite modes are reflections and the Same
 * modes are rotations. Timing: identity and the N-S mirror keep South fixed
 * (Together); the 180 turn and the E-W flip swap North and South (Split); the
 * 90 degree turns and the diagonal reflections move it a quarter (Quarter).
 * QS and QO each have two senses; handModeToEngine picks one.
 */
export const HAND_MODE_MAPS: Readonly<
  Record<VtgMode, readonly HandRelationshipMap[]>
> = {
  TS: ["identity"],
  TO: ["reflect-north-south"],
  SS: ["rotate-180"],
  SO: ["reflect-east-west"],
  QS: ["rotate-90-cw", "rotate-90-ccw"],
  QO: ["reflect-northeast-southwest", "reflect-northwest-southeast"],
};

export function handModeMaps(mode: VtgMode): readonly HandRelationshipMap[] {
  return HAND_MODE_MAPS[mode];
}

export function isReflectionMode(mode: VtgMode): boolean {
  return isReflectionMap(HAND_MODE_MAPS[mode][0]!);
}

export function propDirectionOf(
  mode: VtgMode
): PropRelationshipOptions["direction"] {
  return mode.charAt(1) === "S" ? "same" : "opp";
}

export function propTimingOf(
  mode: VtgMode
): NonNullable<PropRelationshipOptions["timing"]> {
  const letter = mode.charAt(0);
  if (letter === "T") return "tog";
  if (letter === "S") return "split";
  return "quarter";
}

/** The engine prop option for a selection, or undefined for Free. */
export function propModeToEngine(
  selection: TnDSelection
): PropRelationshipOptions | undefined {
  if (selection === "free") return undefined;
  return {
    direction: propDirectionOf(selection),
    timing: propTimingOf(selection),
  };
}

/**
 * The prop-direction law: props spin opposite exactly when the hand map is a
 * reflection or the motion types are inverted, not both. So a requested prop
 * direction fixes the inversion. With Free props the engine keeps its natural
 * sense (reflection gives opposite spin, rotation gives same spin).
 */
export function deriveHandInversion(
  hand: TnDSelection,
  prop: TnDSelection
): boolean {
  if (hand === "free" || prop === "free") return false;
  return isReflectionMode(hand) !== (propDirectionOf(prop) === "opp");
}

const DIAGONAL_AXIS_MAP: Partial<Record<ReflectionAxis, HandRelationshipMap>> =
  {
    "northeast-southwest": "reflect-northeast-southwest",
    "northwest-southeast": "reflect-northwest-southeast",
  };

export interface HandModeContext {
  prop: TnDSelection;
  /** The reflection axis of a mirrored or flipped LOOP, when one is set. */
  loopAxis?: ReflectionAxis | null;
  /** Grid locations of the pinned start placement, when one is set. */
  startLocations?: { left: string; right: string } | null;
  /** Injectable for tests; defaults to Math.random. */
  random?: () => number;
}

/**
 * The engine option for a hand selection, or undefined for Free. QS and QO
 * have two senses. A pinned start decides: the sense whose map sends the right
 * hand's start location onto the left's. Otherwise a diagonal LOOP axis
 * decides for QO (the reflection must be the LOOP's own). Otherwise a random
 * sense per build, so consecutive generations differ.
 */
export function handModeToEngine(
  hand: TnDSelection,
  context: HandModeContext
): HandRelationshipOptions | undefined {
  if (hand === "free") return undefined;
  const maps = HAND_MODE_MAPS[hand];
  const inverted = deriveHandInversion(hand, context.prop);
  if (maps.length === 1) return { map: maps[0]!, inverted };

  const start = context.startLocations;
  const pinned = start
    ? maps.find(
        (map) =>
          HAND_RELATIONSHIP_LOCATION_MAPS[map][start.right] === start.left
      )
    : undefined;
  if (pinned) return { map: pinned, inverted };

  const fromLoop = context.loopAxis
    ? DIAGONAL_AXIS_MAP[context.loopAxis]
    : undefined;
  if (fromLoop && maps.includes(fromLoop)) return { map: fromLoop, inverted };

  const random = context.random ?? Math.random;
  const index = Math.min(maps.length - 1, Math.floor(random() * maps.length));
  return { map: maps[index]!, inverted };
}

/** Card and summary wording: "Free", "Together Same", "Quarter Opposite". */
export function describeTnDSelection(selection: TnDSelection): string {
  if (selection === "free") return "Free";
  const words = MODE_WORDS[selection];
  return `${words.timing} ${words.direction}`;
}
