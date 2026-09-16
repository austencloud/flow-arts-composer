import { describe, it, expect } from "vitest";
import { handPlacementsContent } from "./hand-placements.content";
import { blockProseText } from "../guide-content-blocks";

describe("hand-placements content", () => {
  it("carries Austen's verbatim placement definitions", () => {
    const text = blockProseText(handPlacementsContent);
    expect(text).toContain("In Alpha, the hands occupy the points across from each other.");
    expect(text).toContain("In Beta, the hands occupy the same point.");
    expect(text).toContain("In Gamma, the hands form a right angle.");
    expect(text).toContain(
      "There are multiple ways to combine two hand points to form a hand placement."
    );
    expect(text).toContain(
      "In The Kinetic Alphabet, our first three placements are called Alpha, Beta, and Gamma."
    );
  });

  it("includes the 16 canonical placements across the α/β/γ groups (4/4/8)", () => {
    const groups = handPlacementsContent.filter((b) => b.kind === "pictographGroup");
    expect(groups.length).toBe(3);
    const counts = groups.map((g) => (g.kind === "pictographGroup" ? g.items.length : 0));
    expect(counts).toEqual([4, 4, 8]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(16);
  });

  it("leads each section with a placement glyph", () => {
    const glyphs = handPlacementsContent.filter((b) => b.kind === "glyphImage");
    expect(glyphs.map((g) => g.kind === "glyphImage" && g.alt)).toEqual([
      "Alpha (α)",
      "Beta (β)",
      "Gamma (γ)",
    ]);
  });
});
