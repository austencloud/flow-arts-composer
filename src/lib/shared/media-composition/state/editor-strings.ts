import {
  englishString,
  formatString,
  type StringKey,
} from "@austencloud/video-editor";
import { t } from "$lib/shared/i18n/i18n.svelte.js";

/** The editor's messages as tka shows them today. */
const TKA_TEXT: Partial<Record<StringKey, string>> = {
  editor_save_failed: "Post Studio could not save this post: {error}",
  editor_import_busy: "Finish the current edit before importing a post.",
  editor_missing_media: "Missing media: {name}",
  editor_missing_video: "Missing video: {name}",
  editor_missing_image: "Missing image: {name}",
};

/** The host translate tka hands the editor (seam design F). */
export function tkaEditorTranslate(
  key: StringKey,
  params?: Record<string, string | number>
): string {
  if (key === "editor_default_take") return t("post_editor_default_take");
  const text = TKA_TEXT[key];
  return text === undefined
    ? englishString(key, params)
    : formatString(text, params);
}
