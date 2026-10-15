import { describe, expect, it } from "vitest";
import {
  SEO_LOCALES,
  alternatesFor,
  catalogAssetPath,
  isLocalizedPublicPath,
  localizeHref,
  localizePath,
  localizedPageLocale,
  routePathFor,
  splitLocalePath,
} from "#lib/shared/i18n/seo-locales.js";
import { normalizeModuleId } from "#lib/shared/navigation/config/module-definitions.js";

describe("seo locale registry", () => {
  it("splits a language folder off the path", () => {
    expect(splitLocalePath("/de/guide/level-2")).toEqual({
      locale: "de",
      path: "/guide/level-2",
    });
    expect(splitLocalePath("/guide/level-2")).toEqual({
      locale: "en",
      path: "/guide/level-2",
    });
    expect(splitLocalePath("/de")).toEqual({ locale: "de", path: "/" });
    expect(splitLocalePath("/ja/guide")).toEqual({
      locale: "en",
      path: "/ja/guide",
    });
  });

  it("localizes only the guide tree, minus replicas and tools", () => {
    expect(isLocalizedPublicPath("/guide")).toBe(true);
    expect(isLocalizedPublicPath("/guide/zans-diamond")).toBe(true);
    expect(isLocalizedPublicPath("/guide/level-1/print")).toBe(false);
    expect(isLocalizedPublicPath("/guide/level-1/book/3")).toBe(false);
    expect(isLocalizedPublicPath("/guide/level-2/print")).toBe(false);
    expect(isLocalizedPublicPath("/guide/codex/poster")).toBe(false);
    expect(isLocalizedPublicPath("/guide/codex")).toBe(true);
    expect(isLocalizedPublicPath("/guidebook")).toBe(false);
    expect(isLocalizedPublicPath("/about")).toBe(false);
  });

  it("builds localized paths and hrefs", () => {
    expect(localizePath("/guide/level-2", "en")).toBe("/guide/level-2");
    expect(localizePath("/guide/level-2", "fr")).toBe("/fr/guide/level-2");
    const here = new URL("https://tkaflowarts.com/es/guide");
    expect(localizeHref("/guide/level-1/letters#a", here)).toBe(
      "/es/guide/level-1/letters#a"
    );
    expect(localizeHref("/about", here)).toBe("/about");
    expect(localizeHref("https://example.com/guide", here)).toBe(
      "https://example.com/guide"
    );
    expect(
      localizeHref("/guide", new URL("https://tkaflowarts.com/guide"))
    ).toBe("/guide");
  });

  it("lists every language plus x-default for a localized path", () => {
    const alternates = alternatesFor("/guide/ratios");
    expect(alternates.map((a) => a.hreflang)).toEqual([
      "en",
      ...SEO_LOCALES,
      "x-default",
    ]);
    expect(alternates.find((a) => a.hreflang === "x-default")?.path).toBe(
      "/guide/ratios"
    );
    expect(alternatesFor("/about")).toEqual([]);
  });

  it("names a URL's page language only for localized pages", () => {
    expect(localizedPageLocale("/de/guide/ratios")).toBe("de");
    expect(localizedPageLocale("/guide/ratios")).toBeUndefined();
    expect(localizedPageLocale("/de/about")).toBeUndefined();
    expect(routePathFor("/it/guide")).toBe("/guide");
    expect(routePathFor("/it/about")).toBe("/it/about");
  });

  it("never collides with an app module id", () => {
    for (const locale of SEO_LOCALES) {
      expect(normalizeModuleId(locale)).toBeFalsy();
    }
  });
});

describe("catalogAssetPath", () => {
  it("drops the dev server's cache-busting query so read() finds the file", () => {
    expect(catalogAssetPath("/messages/de.json?t=1792035115119")).toBe(
      "/messages/de.json"
    );
    expect(catalogAssetPath("/_app/immutable/assets/de.B1x2.json")).toBe(
      "/_app/immutable/assets/de.B1x2.json"
    );
  });
});
