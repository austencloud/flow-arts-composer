import { afterEach, describe, expect, it } from "vitest";
import { pinDocumentLanguage, setLocale } from "./i18n.svelte";
import { siteCopyLocale } from "$lib/shared/landing/site-copy";

// Public pages show English site copy under most locales. If the document
// followed an Arabic locale there, English sentences would run right-to-left
// with their punctuation at the front, and nothing would throw.
describe("document language on public pages", () => {
  afterEach(async () => {
    pinDocumentLanguage(null);
    await setLocale("en");
  });

  it("keeps English site copy left-to-right under an Arabic locale", async () => {
    await setLocale("ar");
    expect(document.documentElement.dir).toBe("rtl");

    pinDocumentLanguage(siteCopyLocale());
    expect(siteCopyLocale()).toBe("en");
    expect(document.documentElement.dir).toBe("ltr");
    expect(document.documentElement.lang).toBe("en");

    pinDocumentLanguage(null);
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.lang).toBe("ar");
  });
});
