import { afterEach, describe, expect, it } from "vitest";
import { setLocale, t } from "#lib/shared/i18n/i18n.svelte.js";
import { tkaEditorTranslate } from "#lib/shared/media-composition/state/editor-strings.js";

afterEach(async () => {
  await setLocale("en");
  document.cookie = "PARAGLIDE_LOCALE=; max-age=0; path=/";
});

describe("tka editor strings", () => {
  it("keeps today's save error", () => {
    expect(tkaEditorTranslate("editor_save_failed", { error: "quota" })).toBe(
      "Post Studio could not save this post: quota"
    );
  });

  it("keeps today's import messages", () => {
    expect(tkaEditorTranslate("editor_import_busy")).toBe(
      "Finish the current edit before importing a post."
    );
    expect(tkaEditorTranslate("editor_missing_media", { name: "a.wav" })).toBe(
      "Missing media: a.wav"
    );
    expect(tkaEditorTranslate("editor_missing_video", { name: "b.mp4" })).toBe(
      "Missing video: b.mp4"
    );
    expect(tkaEditorTranslate("editor_missing_image", { name: "c.png" })).toBe(
      "Missing image: c.png"
    );
  });

  it("names a new take with tka's translation", async () => {
    // English reads "Take" both from the package and from tka's messages, so
    // only another language shows the name goes through tka's translator.
    await setLocale("de");
    expect(tkaEditorTranslate("editor_default_take")).toBe("Aufnahme");
    expect(tkaEditorTranslate("editor_default_take")).toBe(
      t("post_editor_default_take")
    );
  });
});
