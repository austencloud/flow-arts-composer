/**
 * The Start/End corner words in the visitor's language.
 *
 * Main thread only: the composition worker has no locale, so callers that
 * hand work to it pass these words in through `stepLabels`.
 */
import { t } from "#lib/shared/i18n/i18n.svelte.js";
import type { StepLabels } from "./step-number-renderer";

export function localStepLabels(): StepLabels {
  return { start: t("viewer_ui_start"), end: t("viewer_final_end") };
}
