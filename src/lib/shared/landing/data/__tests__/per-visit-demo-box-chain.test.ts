// @vitest-environment jsdom
/**
 * Regression: the hero attract act chained a box-transformed sequence's start
 * position into the next draw, which always runs `gridMode: DIAMOND`. No
 * 4-step path exists from a box pose in diamond space, so the builder burned
 * all 40 attempts and threw — 239 times across 5 visitors on 2026-08-09, each
 * one dropping the hero back to the baked fallback sequence.
 *
 * Two guards now: hero-act never offers a box start as a chain target, and
 * per-visit-demo retries unchained rather than serving the fixture.
 */
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const csvBase = "static/data/pictographs/";
(globalThis as unknown as { window: { csvData: unknown } }).window.csvData = {
  diamondData: readFileSync(csvBase + "DiamondPictographDataframe.csv", "utf8"),
  boxData: readFileSync(csvBase + "BoxPictographDataframe.csv", "utf8"),
  skewedData: readFileSync(csvBase + "SkewedPictographDataframe.csv", "utf8"),
  trigridData: "",
};

const { generatePerVisitDemo, FALLBACK_DEMO } = await import("../per-visit-demo");
const { applyBoxMode } = await import(
  "$lib/features/choreo-card/services/deck-variation"
);

describe("per-visit demo chained to a box start position", () => {
  it("returns a real sequence instead of the baked fallback", async () => {
    const seed = JSON.parse(JSON.stringify(await generatePerVisitDemo()));
    expect(seed.id).not.toBe(FALLBACK_DEMO.id);

    const boxed = applyBoxMode(seed, "box") as { startPlacement?: unknown };
    const chained = await generatePerVisitDemo({
      startPlacement: boxed.startPlacement as never,
    });

    // The fixture is what the unguarded path served. A generated word here is
    // the proof that the unchained retry ran.
    expect(chained.steps.length).toBe(16);
    expect(chained).not.toBe(FALLBACK_DEMO);
  }, 120_000);
});
