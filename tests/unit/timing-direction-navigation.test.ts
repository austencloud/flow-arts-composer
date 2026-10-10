import { describe, expect, it } from "vitest";
import { navigationMorphs } from "#lib/shared/transitions/navigation-morphs.js";
import { TIMING_DIRECTION_ARTICLES } from "../../src/routes/(public)/timing-and-direction/_data/timing-direction-articles";

const location = (pathname: string) => ({
  url: { pathname },
  route: { id: null },
});
const hub = "/timing-and-direction";

describe("timing and direction navigation", () => {
  // Each mode guide plays its own sequence, so no canvas is shared with the
  // hub or another guide and a named morph would have nothing to carry.
  it("does not start a shared-canvas morph between the hub and its guides", () => {
    for (const article of TIMING_DIRECTION_ARTICLES) {
      const detail = `${hub}/${article.slug}`;
      expect(navigationMorphs(location(hub), location(detail))).toBe(false);
      expect(navigationMorphs(location(detail), location(hub))).toBe(false);
    }
    expect(
      navigationMorphs(
        location(`${hub}/${TIMING_DIRECTION_ARTICLES[0]!.slug}`),
        location(`${hub}/${TIMING_DIRECTION_ARTICLES[1]!.slug}`)
      )
    ).toBe(false);
  });
});
