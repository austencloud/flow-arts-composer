import { t } from "$lib/shared/i18n/i18n.svelte.js";

/** Localize descriptive guide titles without changing TKA sequence identity. */
export function guideTurnDisplayWord(word: string): string {
  switch (word) {
    case "Prospin with a turn":
      return t("guide_runtime_prospin_turn");
    case "Antispin with a turn":
      return t("guide_runtime_antispin_turn");
    case "Dash with a turn":
      return t("guide_runtime_dash_turn");
    case "Static turn":
      return t("guide_runtime_static_turn");
    case "Prospin with 2 turns":
      return t("guide_runtime_prospin_two_turns");
    case "Antispin with 2 turns":
      return t("guide_runtime_antispin_two_turns");
    case "Dash with 2 turns":
      return t("guide_runtime_dash_two_turns");
    case "Static with 2 turns":
      return t("guide_runtime_static_two_turns");
    default:
      return word;
  }
}
