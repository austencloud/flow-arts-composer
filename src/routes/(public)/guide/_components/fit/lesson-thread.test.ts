import { describe, expect, it } from "vitest";
import { pieceFill, threadOf, threadPosition } from "./lesson-thread";
import { level1Thread } from "../../level-1/_data/lesson-line";
import { level2Thread } from "../../level-2/_data/lesson-line";
import { GUIDE_WEB_PAGES } from "../../level-1/_data/guide-manifest";
import { webPageNeighbours } from "../../level-1/_data/guide-reader-nav";
import { LEVEL2_TOPIC_PAGES } from "../../level-2/_data/level2-topic-routes";
import { HAND_TYPE_SLUGS } from "../../level-1/_topics/hand-type-switcher";

const LESSONS = [
  { pages: [{ slug: "a", screens: 2 }] },
  {
    pages: [
      { slug: "b", screens: 6 },
      { slug: "c", screens: 2 },
    ],
  },
];

describe("a page's place on its chapter's line", () => {
  it("fills a lesson of several pages from one page to the next", () => {
    const b = threadOf("x", LESSONS, "b")!;
    const c = threadOf("x", LESSONS, "c")!;
    expect(b.lengths).toEqual([2, 8]);
    expect(threadPosition(b, 5, 6)).toBeCloseTo(1.75);
    expect(threadPosition(c, 0, 2)).toBeCloseTo(1.875);
    expect(threadPosition(c, 1, 2)).toBeCloseTo(2);
  });

  it("fills a page by its true screen count, whatever the window's cut", () => {
    const a = threadOf("x", LESSONS, "a")!;
    expect(threadPosition(a, 8, 9)).toBe(1);
    expect(pieceFill(1.75, 0)).toBe(1);
    expect(pieceFill(1.75, 1)).toBeCloseTo(0.75);
    expect(pieceFill(1.75, 2)).toBe(0);
  });

  it("has no line for a page outside the lessons", () => {
    expect(threadOf("x", LESSONS, "z")).toBeNull();
  });
});

describe("the Guide's lines", () => {
  it("only ever moves forward from a Level 1 page to its Next page", () => {
    for (const page of GUIDE_WEB_PAGES) {
      const here = level1Thread(page.id)!;
      expect(here, page.id).not.toBeNull();
      const next = webPageNeighbours(page.id).next;
      const there = next && level1Thread(next.id);
      if (!there || there.chapter !== here.chapter) continue;
      expect(threadPosition(there, 0, 1), next.id).toBeGreaterThan(
        threadPosition(here, 0, 1)
      );
    }
  });

  it("draws the six combinations' pages as one piece", () => {
    const pieces = [...HAND_TYPE_SLUGS].map((s) => level1Thread(s)!.piece);
    expect(new Set(pieces).size).toBe(1);
  });

  it("covers every Level 2 lesson", () => {
    for (const page of LEVEL2_TOPIC_PAGES)
      expect(level2Thread(page.slug)?.chapter).toBe(`level-2-${page.chapter}`);
  });
});
