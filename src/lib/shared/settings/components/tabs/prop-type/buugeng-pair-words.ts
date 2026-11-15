/**
 * A buugeng pair in words, as the pair tiles and the phone's pair box name it:
 * "Mirrored" or "Matching", then which letter each hand holds.
 */
import { t } from "#lib/shared/i18n/i18n.svelte.js";
import { chiralityLetter, type BuugengPair } from "./buugeng-pair";

export function buugengPairName(pair: BuugengPair): string {
  return pair.kind === "mirrored"
    ? t("settings_buugeng_pair_mirrored")
    : t("settings_buugeng_pair_matching");
}

export function buugengPairLetters(pair: BuugengPair): string {
  return pair.kind === "mirrored"
    ? t("settings_buugeng_pair_letters", {
        left: chiralityLetter(pair.leftFlipped),
        right: chiralityLetter(pair.rightFlipped),
      })
    : t("settings_buugeng_pair_both", {
        letter: chiralityLetter(pair.leftFlipped),
      });
}

/** "Mirrored, Left A, right B" */
export function buugengPairWords(pair: BuugengPair): string {
  return `${buugengPairName(pair)}, ${buugengPairLetters(pair)}`;
}
