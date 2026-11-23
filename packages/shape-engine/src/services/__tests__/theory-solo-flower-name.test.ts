import { describe, expect, it } from "vitest";
import {
  buildTheoryAxis,
  DEFAULT_THEORY_RATIO,
  STATIONARY_RATIO,
} from "@tka/shape-domain";
import { theorySoloFlowerName } from "../shape-matrix-display";

// The Ratios heading names a hand alone in spinner words. The petal count and
// spin come from the flower itself, so a wrong field would put the wrong
// flower's name over the stage with nothing on screen to show it.
describe("theorySoloFlowerName", () => {
  it("names every flower on a ratio's axis by its own petals and spin", () => {
    const axis = buildTheoryAxis(DEFAULT_THEORY_RATIO);
    expect(axis.length).toBeGreaterThan(0);
    for (const flower of axis) {
      const spin = flower.style === "pro" ? "inspin" : "antispin";
      expect(theorySoloFlowerName(flower)).toBe(
        `${flower.petals}-petal ${spin} flower`
      );
    }
  });

  it("gives no name to a still hand, where the ratio says it all", () => {
    for (const flower of buildTheoryAxis(STATIONARY_RATIO)) {
      expect(theorySoloFlowerName(flower)).toBeNull();
    }
  });
});
