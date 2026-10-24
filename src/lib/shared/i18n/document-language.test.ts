import { afterEach, describe, expect, it } from "vitest";
import { pinDocumentLanguage, setLocale } from "./i18n.svelte";
import { siteCopyLocale } from "#lib/shared/landing/site-copy.js";

// Public pages show English site copy under any locale that has not translated
// it. If the document followed an Arabic locale there, English sentences would
// run right-to-left with their punctuation at the front, and nothing would throw.
describe("document language on public pages", () => {
  afterEach(async () => {
    pinDocumentLanguage(null);
    await setLocale("en");
  });

  it("keeps English site copy left-to-right under an Arabic locale", async () => {
    await setLocale("ar");
    expect(document.documentElement.dir).toBe("rtl");

    // What a public page pins when its copy falls back to English.
    pinDocumentLanguage("en");
    expect(document.documentElement.dir).toBe("ltr");
    expect(document.documentElement.lang).toBe("en");

    pinDocumentLanguage(null);
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.lang).toBe("ar");
  });

  it("pins the page to Arabic once Arabic carries the site copy", async () => {
    // The Arabic catalog gained the site copy in d496066396, so public pages
    // now render in Arabic and stay right-to-left.
    await setLocale("ar");
    expect(siteCopyLocale()).toBe("ar");

    pinDocumentLanguage(siteCopyLocale());
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.lang).toBe("ar");
  });
});
