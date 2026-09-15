import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { SequenceExportOptions } from "$lib/shared/render/domain/models/sequence-export-options";
import type { TnDElement } from "./tnd-element";

/**
 * The fixed playing-card look for every LOCKED choreo-card render: released
 * decks, print preview, deck releaser, the whole Choreo-cards tab. This is the
 * single source of truth — change the card look by editing this one object.
 *
 * NOT used by the flexible sequence-viewer download (that reads the global
 * VisibilityStateManager). Keep the two domains separate on purpose.
 */
export const CANONICAL_DECK_CARD_PROFILE = Object.freeze({
  // Pictograph "Choreo parts"
  showGrid: true,
  showTKA: true,
  handPointVisibility: "all" as const,
  showNonRadialPoints: false,
  showReversals: true,
  showPositions: false,
  showTnD: false,
  showPropTnD: false,
  showHandColorKey: true,
  // Composition flags that are always-on for deck cards
  addWord: true,
  showQRCode: true,
  printMode: true,
  darkMode: false,
});

export interface CanonicalCardVisibility {
  /** Top-level compose option (NOT a visibilityOverrides member). */
  addWord: boolean;
  /** Spread into composeOptions.visibilityOverrides. */
  visibilityOverrides: Pick<
    NonNullable<SequenceExportOptions["visibilityOverrides"]>,
    | "showGrid"
    | "showTKA"
    | "handPointVisibility"
    | "showNonRadialPoints"
    | "showReversals"
    | "showPositions"
    | "showTnD"
    | "showPropTnD"
    | "showHandColorKey"
    | "showElemental"
    | "showQRCode"
    | "printMode"
    | "darkMode"
    | "leftPropType"
    | "rightPropType"
  >;
}

/**
 * Build the complete locked visibility set for one card. `showElemental` is the
 * only per-card value: TnD-deck cards show each pictograph's element glyph.
 */
export function buildCanonicalCardVisibility(args: {
  tndElement?: TnDElement | null;
  leftPropType?: PropType;
  rightPropType?: PropType;
}): CanonicalCardVisibility {
  return {
    addWord: CANONICAL_DECK_CARD_PROFILE.addWord,
    visibilityOverrides: {
      showGrid: CANONICAL_DECK_CARD_PROFILE.showGrid,
      showTKA: CANONICAL_DECK_CARD_PROFILE.showTKA,
      handPointVisibility: CANONICAL_DECK_CARD_PROFILE.handPointVisibility,
      showNonRadialPoints: CANONICAL_DECK_CARD_PROFILE.showNonRadialPoints,
      showReversals: CANONICAL_DECK_CARD_PROFILE.showReversals,
      showPositions: CANONICAL_DECK_CARD_PROFILE.showPositions,
      showTnD: CANONICAL_DECK_CARD_PROFILE.showTnD,
      showPropTnD: CANONICAL_DECK_CARD_PROFILE.showPropTnD,
      showHandColorKey: CANONICAL_DECK_CARD_PROFILE.showHandColorKey,
      showElemental: args.tndElement != null,
      showQRCode: CANONICAL_DECK_CARD_PROFILE.showQRCode,
      printMode: CANONICAL_DECK_CARD_PROFILE.printMode,
      darkMode: CANONICAL_DECK_CARD_PROFILE.darkMode,
      ...(args.leftPropType && { leftPropType: args.leftPropType }),
      ...(args.rightPropType && { rightPropType: args.rightPropType }),
    },
  };
}
