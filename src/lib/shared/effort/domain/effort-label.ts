import { t } from "#lib/shared/i18n/i18n.svelte.js";
import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";
import type { EffortId } from "./effort-types.js";

const EFFORT_NAME_KEYS: Record<EffortId, TranslationKey> = {
  linear: "viewer_ui_linear",
  glide: "viewer_ui_effort_name_glide",
  dab: "viewer_ui_effort_name_dab",
  press: "viewer_ui_effort_name_press",
  punch: "viewer_ui_effort_name_punch",
  elastic: "viewer_ui_effort_name_elastic",
  bounce: "viewer_ui_effort_name_bounce",
  anticipation: "viewer_ui_effort_name_anticipation",
};

/** Translated name of an effort preset; the descriptor's label stays English. */
export function localizedEffortLabel(id: EffortId): string {
  return t(EFFORT_NAME_KEYS[id]);
}

const EFFORT_SUBTITLE_KEYS: Record<EffortId, TranslationKey> = {
  linear: "viewer_ui_effort_sub_linear",
  glide: "viewer_ui_effort_sub_glide",
  dab: "viewer_ui_effort_sub_dab",
  press: "viewer_ui_effort_sub_press",
  punch: "viewer_ui_effort_sub_punch",
  elastic: "viewer_ui_effort_sub_elastic",
  bounce: "viewer_ui_effort_sub_bounce",
  anticipation: "viewer_ui_effort_sub_anticipation",
};

/** Translated one-line description of an effort preset ("light, sustained"). */
export function localizedEffortSubtitle(id: EffortId): string {
  return t(EFFORT_SUBTITLE_KEYS[id]);
}
