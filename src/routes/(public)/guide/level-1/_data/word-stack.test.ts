import { describe, expect, it } from "vitest";
import { captionIsTimingNote, wordStackBeats } from "./word-stack";
import { lt1AbcGhiContent } from "./content/lt1-abc-ghi.content";
import { sixteenCountContent } from "./content/sixteen-count.content";
import type { GuideBlock } from "./guide-content-blocks";

const groups = (content: GuideBlock[]) =>
  content.filter(
    (b): b is Extract<GuideBlock, { kind: "pictographGroup" }> =>
      b.kind === "pictographGroup" && !!b.card
  );

describe("the word screen's choice", () => {
  it("stacks a start pose plus four beats and keeps the four beats", () => {
    for (const g of groups(lt1AbcGhiContent)) {
      const beats = wordStackBeats(g.items);
      expect(beats).toHaveLength(4);
      expect(beats).not.toContain(g.items[0]);
    }
  });
  it("leaves every longer or shorter word as it was", () => {
    const some = groups(lt1AbcGhiContent)[0]!.items;
    expect(wordStackBeats(some.slice(0, 3))).toBeNull();
    expect(wordStackBeats([...some, some[1]!])).toBeNull();
    for (const g of groups(sixteenCountContent)) {
      expect(wordStackBeats(g.items)).toBeNull();
    }
  });
  it("drops a caption that only names timing and direction, keeps one that says more", () => {
    expect(captionIsTimingNote("GGGG: β→β Tog-Same")).toBe(true);
    expect(captionIsTimingNote("MPMP: γ→γ (Opp)")).toBe(true);
    expect(captionIsTimingNote("AABB: thumbs in | in")).toBe(false);
    expect(captionIsTimingNote("MP: Magic Potion")).toBe(false);
    expect(captionIsTimingNote(undefined)).toBe(false);
  });
});
