import { describe, expect, it } from "vitest";
import { enteredCourseFromOutside } from "./concept-routes";

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
