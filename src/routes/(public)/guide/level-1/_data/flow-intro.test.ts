import { describe, expect, it } from "vitest";
import type { GuideBlock } from "./guide-content-blocks";
import { GUIDE_CONTENT } from "./guide-content";
import { seoForSlug } from "./guide-page-seo";
import { taglineInIntro } from "./flow-intro";

const prose = (html: string) => ({ kind: "prose", html }) as GuideBlock;

describe("taglineInIntro", () => {
  it("tells a tagline-only intro from one that says more", () => {
    const tag = "There are three fundamental hand motions in the Alphabet.";
    expect(taglineInIntro([prose(tag)], tag)).toBe("same");
    expect(
      taglineInIntro([prose(`${tag}<br>The arrow shows the direction.`)], tag)
    ).toBe("contains");
    expect(taglineInIntro([prose("Something else.")], tag)).toBe("none");
    expect(taglineInIntro([prose(tag)], "")).toBe("none");
  });

  it("shows the Hand Motions intro line once, in the intro", () => {
    const content = GUIDE_CONTENT["hand-motions"]!;
    const { tagline } = seoForSlug("hand-motions", "Hand Motions");
    expect(taglineInIntro(content, tagline!)).toBe("contains");
  });
});
