import { describe, expect, it } from "vitest";
import {
  getTimingDirectionArticle,
  getTimingDirectionArticleByPair,
  TIMING_DIRECTION_ARTICLES,
  TIMING_DIRECTION_ARTICLE_SLUGS,
  TIMING_DIRECTION_SOURCE,
} from "../../src/routes/(public)/timing-and-direction/_data/timing-direction-articles";

describe("timing and direction article cluster", () => {
  it("covers the complete three-by-two mode matrix once", () => {
    expect(TIMING_DIRECTION_ARTICLES).toHaveLength(6);
    expect(new Set(TIMING_DIRECTION_ARTICLE_SLUGS).size).toBe(6);
    expect(
      TIMING_DIRECTION_ARTICLES.map((article) => [
        article.timing,
        article.direction,
      ])
    ).toEqual([
      ["Split", "Same"],
      ["Together", "Same"],
      ["Quarter", "Same"],
      ["Split", "Opposite"],
      ["Together", "Opposite"],
      ["Quarter", "Opposite"],
    ]);
  });

  it("keeps phase and representative letters attached to canonical mode codes", () => {
    expect(
      Object.fromEntries(
        TIMING_DIRECTION_ARTICLES.map((article) => [
          article.code,
          [article.phase, article.representativeLetter],
        ])
      )
    ).toEqual({
      SS: ["180°", "A"],
      TS: ["0°", "G"],
      QS: ["90° / 270°", "S"],
      SO: ["180°", "J"],
      TO: ["0°", "D"],
      QO: ["90° / 270°", "M"],
    });
  });

  it("gives every indexable article unique substantive copy", () => {
    expect(
      new Set(TIMING_DIRECTION_ARTICLES.map(({ name }) => name)).size
    ).toBe(6);
    expect(
      new Set(TIMING_DIRECTION_ARTICLES.map(({ definition }) => definition))
        .size
    ).toBe(6);

    for (const article of TIMING_DIRECTION_ARTICLES) {
      expect(article.metaDescription.length).toBeLessThanOrEqual(160);
      expect(article.metaDescription.startsWith(article.name)).toBe(true);
      expect(getTimingDirectionArticle(article.slug)).toEqual(article);
      expect(
        getTimingDirectionArticleByPair(article.timing, article.direction)
      ).toEqual(article);
    }
  });

  it("credits the Vulcan Tech Gospel as the source of the mode names", () => {
    expect(new URL(TIMING_DIRECTION_SOURCE.url).protocol).toBe("https:");
    expect(TIMING_DIRECTION_SOURCE.label).toContain("Vulcan Tech Gospel");
  });
});
