/**
 * Hand Placements' shared teaching content: Austen's verbatim proof copy
 * (verified_level1_*) and the 16 diamond placements grouped as Alpha, Beta
 * and Gamma. The Guide web page and the written-guide sheet read from here.
 * The intro is split into its sentences so a view can set them one at a
 * time, and each definition has a brief form without its lead-in; the
 * words are otherwise unchanged.
 * Spec: docs/superpowers/specs/2026-10-10-guide-rethink-design.md
 */
import { t } from "#lib/shared/i18n/i18n.svelte.js";
import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";
import { startPlacementManager } from "#lib/shared/create/services/start-placement-manager.js";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

export const PLACEMENTS_TOPIC_UNITS = {
  title: "verified_level1_guide_page_seo_1",
  tagline: "verified_level1_guide_page_seo_2",
  combine: "guide_topic_placements_combine",
  transform: "guide_topic_placements_transform",
  redRight: "guide_topic_placements_red_right",
  blueLeft: "guide_topic_placements_blue_left",
} as const satisfies Record<string, TranslationKey>;

export type PlacementsTopicUnit = keyof typeof PLACEMENTS_TOPIC_UNITS;

export function placementsTopicText(unit: PlacementsTopicUnit): string {
  return t(PLACEMENTS_TOPIC_UNITS[unit]);
}

export type PlacementKind = "alpha" | "beta" | "gamma";

type PlacementFamily = {
  kind: PlacementKind;
  name: TranslationKey;
  /** The family's definition without its "In Alpha," lead-in, for a view
   *  that already titles it with the name. */
  brief: TranslationKey;
  glyph: string;
};

export const PLACEMENT_FAMILIES: readonly PlacementFamily[] = [
  {
    kind: "alpha",
    name: "verified_level1_hand_placements_89",
    brief: "guide_topic_placements_alpha_brief",
    glyph: "/images/letters_trimmed/Type6/α.svg",
  },
  {
    kind: "beta",
    name: "verified_level1_hand_placements_91",
    brief: "guide_topic_placements_beta_brief",
    glyph: "/images/letters_trimmed/Type6/β.svg",
  },
  {
    kind: "gamma",
    name: "verified_level1_hand_placements_93",
    brief: "guide_topic_placements_gamma_brief",
    glyph: "/images/letters_trimmed/Type6/γ.svg",
  },
];

/** The 16 diamond placements with both props shown as hands, α/β/γ = 4/4/8. */
export const HAND_PLACEMENTS = startPlacementManager
  .getAllStartPlacementVariations(GridMode.DIAMOND)
  .map((p) => ({
    ...p,
    motions: {
      left: p.motions?.left
        ? { ...p.motions.left, propType: PropType.HAND }
        : undefined,
      right: p.motions?.right
        ? { ...p.motions.right, propType: PropType.HAND }
        : undefined,
    },
  }));

export type HandPlacement = (typeof HAND_PLACEMENTS)[number];

export const PLACEMENTS_BY_KIND: Readonly<
  Record<PlacementKind, readonly HandPlacement[]>
> = {
  alpha: HAND_PLACEMENTS.slice(0, 4),
  beta: HAND_PLACEMENTS.slice(4, 8),
  gamma: HAND_PLACEMENTS.slice(8, 16),
};
