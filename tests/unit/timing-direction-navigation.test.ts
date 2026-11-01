import { describe, expect, it } from "vitest";
import { load as openMode } from "../../src/routes/(public)/timing-and-direction/[mode]/+page";
import { TIMING_DIRECTION_ARTICLES } from "../../src/routes/(public)/timing-and-direction/_data/timing-direction-articles";

describe("timing and direction navigation", () => {
  // Each mode had its own page until there was one timing-and-direction page
  // (2026-10-31). Old links, bookmarks and search results must still land on
  // the same mode, now a section of that page.
  it("sends each old mode address to its sequences on the one page", () => {
    for (const article of TIMING_DIRECTION_ARTICLES) {
      try {
        openMode({ params: { mode: article.slug } } as never);
        expect.unreachable(`${article.slug} must redirect`);
      } catch (error) {
        expect(error).toMatchObject({
          status: 308,
          location: `/timing-and-direction?mode=${article.slug}#mode-sequences`,
        });
      }
    }
  });

  it("still answers an unknown mode with a 404", () => {
    try {
      openMode({ params: { mode: "sideways-time" } } as never);
      expect.unreachable("an unknown mode must not redirect");
    } catch (error) {
      expect(error).toMatchObject({ status: 404 });
    }
  });
});
