import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("locale selection", () => {
  beforeEach(() => {
    vi.resetModules();
    document.cookie = "PARAGLIDE_LOCALE=; max-age=0; path=/";
    document.documentElement.lang = "en";
    document.documentElement.dir = "ltr";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.cookie = "PARAGLIDE_LOCALE=; max-age=0; path=/";
  });

  it("uses German browser preferences and labels the document accordingly", async () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["de-DE", "en"]);
    const i18n = await import("../../src/lib/shared/i18n/i18n.svelte");
    await i18n.initI18n();
    expect(i18n.getLocale()).toBe("de");
    expect(i18n.t("action_cancel")).toBe("Abbrechen");
    expect(document.documentElement.lang).toBe("de");
    expect(document.documentElement.dir).toBe("ltr");
  });

  it("honors a saved English preference over a German browser", async () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["de-DE"]);
    document.cookie = "PARAGLIDE_LOCALE=en; path=/";
    const i18n = await import("../../src/lib/shared/i18n/i18n.svelte");
    await i18n.initI18n();
    expect(i18n.getLocale()).toBe("en");
    expect(i18n.t("action_cancel")).toBe("Cancel");
    expect(document.documentElement.lang).toBe("en");
  });

  it("keeps the latest choice when an earlier download finishes later", async () => {
    const i18n = await import("../../src/lib/shared/i18n/i18n.svelte");
    const german = i18n.setLocale("de");
    const english = i18n.setLocale("en");
    await Promise.all([german, english]);
    expect(i18n.getLocale()).toBe("en");
    expect(i18n.t("action_cancel")).toBe("Cancel");
    expect(document.documentElement.lang).toBe("en");
    expect(document.cookie).toContain("PARAGLIDE_LOCALE=en");
  });

  it("updates text, persistence, and document language on a manual switch", async () => {
    const i18n = await import("../../src/lib/shared/i18n/i18n.svelte");
    await i18n.setLocale("de");
    expect(i18n.t("action_cancel")).toBe("Abbrechen");
    expect(document.cookie).toContain("PARAGLIDE_LOCALE=de");
    await i18n.setLocale("en");
    expect(i18n.t("action_cancel")).toBe("Cancel");
    expect(document.documentElement.lang).toBe("en");
  });
});
