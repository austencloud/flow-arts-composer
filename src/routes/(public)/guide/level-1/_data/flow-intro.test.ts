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

  it("skips headings of any level before the intro, as Base Letters opens", () => {
    const tag = "Each pictograph can be rotated.";
    const content = [
      { kind: "heading", level: 1, text: "Base Letters" },
      { kind: "heading", level: 2, text: "Type 1 - Dual-Shift" },
      prose(`${tag}<br>Letters are organized by end position.`),
      { kind: "heading", level: 2, text: "Later" },
      prose(tag),
    ] as GuideBlock[];
    expect(taglineInIntro(content, tag)).toBe("contains");
    expect(taglineInIntro(content.slice(0, 3).map((b, i) => (i === 2 ? prose(tag) : b)), tag)).toBe("same");
  });

  it("shows the real Base Letters opening line once", () => {
    const content = GUIDE_CONTENT["base-letters"]!;
    const { tagline } = seoForSlug("base-letters", "Base Letters");
    expect(taglineInIntro(content, tagline!)).toBe("contains");
  });
});
