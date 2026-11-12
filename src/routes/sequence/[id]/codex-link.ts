/**
 * The /codex link for a sequence's "Look up the letters" action: the Codex
 * opened on the first step whose letter it lists. Dash and other variant
 * letters the Codex does not list are skipped. With none, the Codex home.
 */
import { CODEX_BY_LABEL } from "../../(public)/atlas/_components/codex-boards/codex-letters";

export function codexHrefForSteps(
  steps: readonly { letter?: string | null }[]
): string {
  const letter = steps
    .map((step) => step.letter ?? "")
    .find((label) => CODEX_BY_LABEL.has(label));
  return letter ? `/codex?letter=${encodeURIComponent(letter)}` : "/codex";
}
