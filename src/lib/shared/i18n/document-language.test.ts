// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  browserLocale,
  getBaseLocale,
  pinDocumentLanguage,
  setLocale,
} from "./i18n.svelte";
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

// A bare "zh" tells Chrome the page is Simplified, so a Taiwan browser offers to
// translate it and rewrites our words. Traditional readers get their own
// catalog, and the document names the script either way.
describe("Chinese script", () => {
  afterEach(async () => {
    await setLocale("en");
  });

  it("sends Taiwan, Hong Kong and Hant browsers to Traditional", () => {
    for (const tag of ["zh-TW", "zh-HK", "zh-MO", "zh-Hant", "zh-Hant-TW"]) {
      expect(browserLocale(tag)).toBe("zh-Hant");
    }
    for (const tag of ["zh", "zh-CN", "zh-SG", "zh-Hans"]) {
      expect(browserLocale(tag)).toBe("zh");
    }
    expect(browserLocale("pt-BR")).toBe("pt");
    expect(getBaseLocale("zh-TW")).toBe("zh-Hant");
    expect(getBaseLocale("zh-CN")).toBe("zh");
  });

  it("declares the script on the document", async () => {
    await setLocale("zh");
    expect(document.documentElement.lang).toBe("zh-Hans");
    await setLocale("zh-Hant");
    expect(document.documentElement.lang).toBe("zh-Hant");
    await setLocale("zh-TW");
    expect(document.documentElement.lang).toBe("zh-Hant-TW");
  });

  it("keeps browser translators off our own catalogs, on for English", async () => {
    await setLocale("zh");
    expect(document.documentElement.getAttribute("translate")).toBe("no");
    pinDocumentLanguage("en");
    expect(document.documentElement.hasAttribute("translate")).toBe(false);
    pinDocumentLanguage(null);
    await setLocale("en");
    expect(document.documentElement.hasAttribute("translate")).toBe(false);
  });
});
