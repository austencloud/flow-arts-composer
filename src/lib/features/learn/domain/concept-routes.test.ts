import { describe, expect, it } from "vitest";
import {
  buildConceptStagePath,
  conceptHrefWithoutFlags,
  conceptRestartFromUrl,
  conceptStageFromUrl,
  enteredCourseFromOutside,
} from "./concept-routes";

// What SvelteKit's afterNavigate hands a component: where the reader was and
// where they landed. Only the URLs matter to this rule.
function navigation(from: string | null, to: string) {
  return {
    from: from ? { url: new URL(from) } : null,
    to: { url: new URL(to) },
  };
}

const SITE = "https://tkaflowarts.com";

describe("enteredCourseFromOutside", () => {
  it("is true for a lesson opened from another page of the site", () => {
    expect(
      enteredCourseFromOutside(
        navigation(`${SITE}/guide`, `${SITE}/learn/concepts/grid?from-start`)
      )
    ).toBe(true);
    expect(
      enteredCourseFromOutside(
        navigation(
          `${SITE}/guide/level-1/the-grid`,
          `${SITE}/learn/concepts/grid`
        )
      )
    ).toBe(true);
  });

  it("is false for moves inside the course", () => {
    expect(
      enteredCourseFromOutside(
        navigation(`${SITE}/learn/concepts`, `${SITE}/learn/concepts/grid`)
      )
    ).toBe(false);
    expect(
      enteredCourseFromOutside(
        navigation(`${SITE}/learn/concepts/grid`, `${SITE}/learn/concepts`)
      )
    ).toBe(false);
    expect(
      enteredCourseFromOutside(
        navigation(
          `${SITE}/learn/concepts/grid`,
          `${SITE}/learn/concepts/hand-placements`
        )
      )
    ).toBe(false);
  });

  it("is false for a fresh page load, which has no page to return to", () => {
    expect(
      enteredCourseFromOutside(navigation(null, `${SITE}/learn/concepts/grid`))
    ).toBe(false);
  });

  it("is false when the previous page belongs to another site", () => {
    expect(
      enteredCourseFromOutside(
        navigation(
          "https://www.google.com/search?q=tka",
          `${SITE}/learn/concepts/grid`
        )
      )
    ).toBe(false);
  });

  it("is false when the destination is not a lesson", () => {
    expect(
      enteredCourseFromOutside(
        navigation(`${SITE}/guide`, `${SITE}/learn/staff-spinning-choreography`)
      )
    ).toBe(false);
    expect(
      enteredCourseFromOutside({
        from: { url: new URL(`${SITE}/guide`) },
        to: null,
      })
    ).toBe(false);
  });
});

describe("stage links", () => {
  it("builds a lesson link that names a stage", () => {
    expect(buildConceptStagePath("hand-motions-intro", "two-hands")).toBe(
      "/learn/concepts/hand-motions-intro?stage=two-hands"
    );
  });

  it("reads the stage off a lesson URL", () => {
    expect(
      conceptStageFromUrl(
        new URL(`${SITE}/learn/concepts/hand-motions-intro?stage=map`)
      )
    ).toEqual({ conceptId: "hand-motions-intro", stage: "map" });
  });

  it("is null without a stage, with an empty stage, or off a lesson", () => {
    expect(
      conceptStageFromUrl(new URL(`${SITE}/learn/concepts/hand-motions-intro`))
    ).toBeNull();
    expect(
      conceptStageFromUrl(
        new URL(`${SITE}/learn/concepts/hand-motions-intro?stage=`)
      )
    ).toBeNull();
    expect(
      conceptStageFromUrl(
        new URL(`${SITE}/guide/level-1/hand-motions?stage=map`)
      )
    ).toBeNull();
  });

  it("strips both entry flags and keeps everything else", () => {
    expect(
      conceptHrefWithoutFlags(
        new URL(
          `${SITE}/learn/concepts/hand-motions-intro?from-start&stage=quiz&keep=1#top`
        )
      )
    ).toBe("/learn/concepts/hand-motions-intro?keep=1#top");
    expect(
      conceptHrefWithoutFlags(
        new URL(`${SITE}/learn/concepts/hand-motions-intro?keep=1`)
      )
    ).toBeNull();
  });

  it("a restart link still resets", () => {
    expect(
      conceptRestartFromUrl(
        new URL(`${SITE}/learn/concepts/grid?from-start&stage=map`)
      )?.conceptId
    ).toBe("grid");
  });
});
