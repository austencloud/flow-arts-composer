import { describe, expect, it } from "vitest";
import { buildGuideToc } from "../../src/routes/(public)/guide/_data/guide-toc";
import { localizeHref } from "#lib/shared/i18n/seo-locales.js";

const hrefs = (localize?: (href: string) => string) =>
  buildGuideToc(localize).flatMap((module) => [
    ...(module.href ? [module.href] : []),
    ...module.sections.flatMap((section) =>
      section.href ? [section.href] : []
    ),
  ]);

describe("guide contents in a language folder", () => {
  it("points every guide row at the page's language and leaves downloads alone", () => {
    const german = new URL("https://tkaflowarts.com/de/guide/ratios");
    const rows = hrefs((href) => localizeHref(href, german));

    const guideRows = rows.filter((href) => !href.endsWith(".pdf"));
    expect(guideRows.length).toBeGreaterThan(10);
    // The Codex is its own page now, still in the reader's language.
    for (const href of guideRows) {
      expect(href).toMatch(/^\/de\/(guide|codex)(\/|$|#)/);
    }
    expect(rows.filter((href) => href.endsWith(".pdf"))).toEqual([
      "/guides/level-1.pdf",
      "/guides/level-2.pdf",
      "/guides/level-3.pdf",
    ]);
  });

  it("keeps English rows unchanged by default", () => {
    for (const href of hrefs()) expect(href.startsWith("/de/")).toBe(false);
  });
});
