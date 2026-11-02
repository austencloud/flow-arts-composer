/**
 * What each combination page of the run says, screen by screen (2026-10-31):
 * the name as the title, Austen's definition from the Hand Motions record as
 * the lede, his guide line, then the example card. Shift has one screen;
 * Cross-Shift adds "Break it down" (the book's breakdown strip); Dash,
 * Dual-Dash and Static share a page, a screen each. The example strips,
 * sequences and Zan's Diamond stay on the print sheets for a later
 * sequencing page; where a guide paragraph runs on into them, the screen
 * shows its first sentences (verified-sentences.ts).
 */
import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";
import type { HandCombination } from "#lib/shared/guide-topics/hand-motions-topic.js";
import { pageCombinations } from "./hand-type-switcher";
import { takeSentences } from "./verified-sentences";

export type CombinationScreen =
  | {
      kind: "combination";
      combination: HandCombination;
      label: string;
      lede: string;
      guide: string;
      closing: string | null;
    }
  | {
      kind: "breakdown";
      combination: HandCombination;
      label: string;
      intro: string;
      caption: string;
      after: string;
    };

type Translate = (key: TranslationKey) => string;

/** The definition line each combination's page opens on. */
const LEDES: Record<HandCombination["id"], TranslationKey> = {
  "dual-shift": "verified_level1_hand_motions_78",
  shift: "verified_level1_hand_motions_80",
  "cross-shift": "verified_level1_hand_motions_82",
  dash: "verified_level1_hand_motions_84",
  "dual-dash": "verified_level1_hand_motions_86",
  static: "verified_level1_hand_motions_87",
};

/** The label of Cross-Shift's second screen. */
export const BREAKDOWN_LABEL = "Break it down";

/** A page's screens, in order; empty for a page outside the run's three. */
export function combinationScreens(
  slug: string,
  t: Translate
): CombinationScreen[] {
  const of = (c: HandCombination) => ({
    combination: c,
    label: t(c.name),
    lede: t(LEDES[c.id]),
  });
  const [first] = pageCombinations(slug);
  if (!first) return [];
  switch (slug) {
    case "hm-type2":
      return [
        {
          kind: "combination",
          ...of(first),
          guide: t("verified_level1_hm_type2_115"),
          closing: t("verified_level1_hm_type2_118"),
        },
      ];
    case "hm-type34": {
      const whole = t("verified_level1_hm_type34_120");
      return [
        {
          kind: "combination",
          ...of(first),
          guide: takeSentences(whole, 0, 2),
          closing: null,
        },
        {
          kind: "breakdown",
          combination: first,
          label: BREAKDOWN_LABEL,
          intro: takeSentences(whole, 2, 3),
          caption: t("verified_level1_hm_type34_121"),
          after: takeSentences(t("verified_level1_hm_type34_122"), 0, 3),
        },
      ];
    }
    case "hm-type56": {
      const [dash, dualDash, still] = pageCombinations(slug);
      return [
        {
          kind: "combination",
          ...of(dash!),
          guide: takeSentences(t("verified_level1_hm_type56_129"), 0, 1),
          closing: null,
        },
        {
          kind: "combination",
          ...of(dualDash!),
          guide: t("verified_level1_hm_type56_132"),
          closing: null,
        },
        {
          kind: "combination",
          ...of(still!),
          guide: t("verified_level1_hm_type56_135"),
          closing: t("verified_level1_hm_type56_136"),
        },
      ];
    }
    default:
      return [];
  }
}
