/**
 * Pure model for the TnD bento card: the two summary lines, the element
 * icons, the accent, and the spoken label. Kept beside the card and out of
 * shared/ because it reads TND_BY_FAMILY, a feature module.
 */
import {
  describeTnDSelection,
  type TnDSelection,
} from "$lib/shared/create/domain/hand-relationship";
import {
  MODE_FAMILY_ID,
  type VtgMode,
} from "$lib/shared/shape-matrix/services/shape-matrix-realizations";
import {
  TND_BY_FAMILY,
  type TnDElement,
} from "$lib/features/choreo-card/domain/tnd-element";

/** The element a selection wears, or null for Free. */
export function tndSelectionElement(
  selection: TnDSelection
): TnDElement | null {
  if (selection === "free") return null;
  return TND_BY_FAMILY[MODE_FAMILY_ID[selection]] ?? null;
}

export interface TnDCardLine {
  label: "Hands" | "Props";
  value: string;
  element: TnDElement | null;
}

export interface TnDCardDisplay {
  hands: TnDCardLine;
  props: TnDCardLine;
  /** The hand mode is set but the current LOOP cannot keep it. */
  handBlocked: boolean;
  accent: string | null;
  darkComplement: string | null;
  /** Something is set and in force, so the card wears an accent. */
  active: boolean;
  ariaLabel: string;
}

export interface TnDCardDisplayInput {
  handRelationship: TnDSelection;
  propRelationship: TnDSelection;
  matchHandTurns: boolean;
  blockedHandModes: Partial<Record<VtgMode, string>>;
}

export function buildTnDCardDisplay(
  input: TnDCardDisplayInput
): TnDCardDisplay {
  const { handRelationship, propRelationship, matchHandTurns } = input;
  const handBlocked =
    handRelationship !== "free" &&
    input.blockedHandModes[handRelationship] !== undefined;

  const handElement = handBlocked
    ? null
    : tndSelectionElement(handRelationship);
  const propElement = tndSelectionElement(propRelationship);
  const handValue = handBlocked
    ? `${describeTnDSelection(handRelationship)}, off with LOOP`
    : describeTnDSelection(handRelationship);

  const accentElement = handElement ?? propElement;
  const turns = matchHandTurns ? ", turns matched" : "";

  return {
    hands: { label: "Hands", value: handValue, element: handElement },
    props: {
      label: "Props",
      value: describeTnDSelection(propRelationship),
      element: propElement,
    },
    handBlocked,
    accent: accentElement?.accentColor ?? null,
    darkComplement: accentElement?.darkComplement ?? null,
    active: accentElement !== null,
    ariaLabel: `Timing and direction: hands ${handValue}, props ${describeTnDSelection(propRelationship)}${turns}. Click to configure.`,
  };
}
