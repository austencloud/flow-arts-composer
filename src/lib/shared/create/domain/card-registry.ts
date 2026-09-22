/**
 * Card Registry - Single source of truth for generator card metadata
 *
 * Both the real CardConfigurator and the onboarding tour derive their card
 * lists from this registry. A panel control cannot appear on either surface
 * without being represented here first.
 */

import {
  getGeneratorHelpContent,
  type GeneratorHelpId,
  type GeneratorHelpItem,
} from "$lib/shared/create/domain/generator-help-content";
import type { CardColors } from "$lib/shared/create/domain/card-colors";

export type GeneratorCardSlot = "level" | "grid";

export interface CardRegistryEntry {
  /** Card ID used by CardConfigurator (e.g. "word-input", "preset") */
  id: string;
  /** Display header shown in the tour mini card (e.g. "WORD", "LEVEL") */
  tourHeader: string;
  /** Default display value in the tour mini card (e.g. "A - Z", "2") */
  tourDefaultValue: string;
  /** Grid span used by the Level 2/3 panel and the tour preview (out of 6). */
  tourSpan: number;
  /** Level 1 uses a three-column settings row instead of two columns. */
  beginnerSpan?: number;
  /** Maps to the help content entry for this card's explanation */
  helpId: GeneratorHelpId;
  /** Panel-specific wording that replaces stale generic help copy. */
  helpOverride?: Partial<GeneratorHelpItem>;
  /** Key into CardColors for this card's gradient */
  colorKey: keyof CardColors;
  /** Level is rendered in its own slot; every other control uses the card grid. */
  slot: GeneratorCardSlot;
  /** Turn Intensity does not exist in the Level 1 panel. */
  hiddenAtBeginner?: boolean;
}

export interface GeneratorCardCapabilities {
  preset: boolean;
  customize: boolean;
  tnd: boolean;
  loop: boolean;
  generate: boolean;
}

const ALWAYS_AVAILABLE: GeneratorCardCapabilities = {
  preset: true,
  customize: true,
  tnd: true,
  loop: true,
  generate: true,
};

/**
 * Ordered list of the controls that exist in the Generate panel. The Level
 * control owns the first slot, followed by the card-grid order users see.
 */
/**
 * Use `as const satisfies` so TypeScript infers the literal ID strings
 * while still validating the shape. This gives us a union type of all
 * card IDs that the CardConfigurator is forced to use.
 */
export const CARD_REGISTRY = [
  {
    id: "level",
    tourHeader: "LEVEL",
    tourDefaultValue: "2",
    tourSpan: 6,
    helpId: "level",
    colorKey: "level",
    slot: "level",
  },
  {
    id: "word-input",
    tourHeader: "WORD",
    tourDefaultValue: "A - Z",
    tourSpan: 2,
    helpId: "generation-mode",
    helpOverride: {
      name: "Word",
      shortDesc: "Type a word or leave it blank",
      fullDesc:
        "Type a word and Generate will build from those letters. Leave the field blank when you want a random sequence.",
      bullets: undefined,
      images: undefined,
    },
    colorKey: "wordInput",
    slot: "grid",
  },
  {
    id: "preset",
    tourHeader: "SETUPS",
    tourDefaultValue: "Browse",
    tourSpan: 2,
    helpId: "favorite",
    colorKey: "favorite",
    slot: "grid",
  },
  {
    id: "length",
    tourHeader: "LENGTH",
    tourDefaultValue: "8",
    tourSpan: 2,
    helpId: "length",
    helpOverride: {
      fullDesc:
        "Sets the number of steps Generate will create. The available values follow your current access and LOOP settings.",
      bullets: undefined,
      images: undefined,
    },
    colorKey: "length",
    slot: "grid",
  },
  {
    id: "grid-mode",
    tourHeader: "GRID",
    tourDefaultValue: "Diamond",
    tourSpan: 2,
    beginnerSpan: 3,
    helpId: "grid-mode",
    colorKey: "gridMode",
    slot: "grid",
  },
  {
    id: "turn-intensity",
    tourHeader: "TURNS",
    tourDefaultValue: "≤1",
    tourSpan: 2,
    helpId: "turn-intensity",
    colorKey: "turnIntensity",
    slot: "grid",
    hiddenAtBeginner: true,
  },
  {
    id: "customize",
    tourHeader: "CUSTOMIZE",
    tourDefaultValue: "Default",
    tourSpan: 2,
    beginnerSpan: 3,
    helpId: "prop-continuity",
    helpOverride: {
      name: "Customize",
      shortDesc: "Fine-tune the recipe",
      fullDesc:
        "Open Customize to set the movement style, start and end placements, and turn pattern used by Generate.",
      bullets: undefined,
      images: undefined,
    },
    colorKey: "customize",
    slot: "grid",
  },
  {
    id: "tnd",
    tourHeader: "TIMING AND DIRECTION",
    tourDefaultValue: "Free",
    tourSpan: 3,
    helpId: "tnd",
    colorKey: "mode",
    slot: "grid",
  },
  {
    id: "loop",
    tourHeader: "LOOP",
    tourDefaultValue: "Rotated",
    tourSpan: 3,
    helpId: "loop-type",
    helpOverride: {
      name: "LOOP",
      shortDesc: "Choose how the sequence repeats",
      fullDesc:
        "Open LOOP to choose its transformations and rhythm. The card previews the exact LOOP recipe Generate will use, or shows Off when LOOP is disabled.",
      bullets: undefined,
      images: undefined,
    },
    colorKey: "mode",
    slot: "grid",
  },
  {
    id: "generate-button",
    tourHeader: "",
    tourDefaultValue: "Generate",
    tourSpan: 6,
    helpId: "generate",
    colorKey: "turnIntensity",
    slot: "grid",
  },
] as const satisfies readonly CardRegistryEntry[];

/**
 * Union type of all valid card IDs. The CardConfigurator's CardDescriptor.id
 * is constrained to this type, so adding a card to the configurator without
 * adding it to the registry is a compile error.
 */
export type GeneratorCardId = (typeof CARD_REGISTRY)[number]["id"];

/**
 * Return the controls that exist for one concrete panel configuration.
 * CardConfigurator and the explanation tour call this with the same level so
 * both surfaces show the same controls in the same order.
 */
export function getGeneratorPanelCards(options?: {
  includeLevel?: boolean;
  isBeginner?: boolean;
  capabilities?: Partial<GeneratorCardCapabilities>;
}): readonly (typeof CARD_REGISTRY)[number][] {
  const includeLevel = options?.includeLevel ?? true;
  const isBeginner = options?.isBeginner ?? false;
  const capabilities = {
    ...ALWAYS_AVAILABLE,
    ...options?.capabilities,
  };

  return CARD_REGISTRY.filter((entry) => {
    if (entry.slot === "level") return includeLevel;
    if ("hiddenAtBeginner" in entry && entry.hiddenAtBeginner && isBeginner) {
      return false;
    }
    if (entry.id === "preset") return capabilities.preset;
    if (entry.id === "customize") return capabilities.customize;
    if (entry.id === "tnd") return capabilities.tnd;
    if (entry.id === "loop") return capabilities.loop;
    if (entry.id === "generate-button") return capabilities.generate;
    return true;
  });
}

export function getGeneratorCardSpan(
  entry: (typeof CARD_REGISTRY)[number],
  isBeginner: boolean
): number {
  if (isBeginner && "beginnerSpan" in entry) return entry.beginnerSpan;
  return entry.tourSpan;
}

export function getGeneratorCardHelp(
  entry: (typeof CARD_REGISTRY)[number]
): GeneratorHelpItem {
  const base = getGeneratorHelpContent(entry.helpId);
  if (!base) {
    throw new Error(`Missing help content for generator card: ${entry.id}`);
  }
  return {
    ...base,
    ...("helpOverride" in entry ? entry.helpOverride : undefined),
    id: base.id,
  };
}

/**
 * Tour stop IDs derived from the registry. Used by generate-tour-state
 * so the stop list stays in sync with the card list.
 */
export const TOUR_STOP_IDS = CARD_REGISTRY.map((c) => c.id);
