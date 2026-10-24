// @vitest-environment jsdom
/**
 * The hero's reversal dots depend on the real engine, not on the option
 * plumbing per-visit-demo.test.ts covers with a mocked orchestrator: "smooth"
 * maps to an engine setting that scores every prop reversal at zero, and
 * "mixed" to one that allows them. If the engine ever stopped reversing under
 * "mixed", the hero would go back to never showing a dot and nothing on the
 * page would say so. Measured when this landed (2026-10-23): eight of ten
 * mixed rolls carried reversals, 8 to 12 of their 16 steps; smooth rolls none.
 */
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

const csvBase = "static/data/pictographs/";
(globalThis as unknown as { window: { csvData: unknown } }).window.csvData = {
  diamondData: readFileSync(csvBase + "DiamondPictographDataframe.csv", "utf8"),
  boxData: readFileSync(csvBase + "BoxPictographDataframe.csv", "utf8"),
  skewedData: readFileSync(csvBase + "SkewedPictographDataframe.csv", "utf8"),
  trigridData: "",
};

const { rollPerVisitDemo } = await import("../per-visit-demo-core");

function reversalSteps(sequence: SequenceData | null): number {
  return (sequence?.steps ?? []).filter(
    (s) => s.leftReversal || s.rightReversal
  ).length;
}

describe("per-visit demo continuity against the real engine", () => {
  it("mixed rolls reverse a prop; smooth rolls never do", async () => {
    // A mixed roll misses about one time in five, so ten tries all missing
    // is about one in ten million: stop at the first roll that reverses.
    let mixed = 0;
    for (let i = 0; i < 10 && mixed === 0; i++) {
      mixed = reversalSteps(await rollPerVisitDemo({ continuity: "mixed" }));
    }
    expect(mixed).toBeGreaterThan(0);

    for (let i = 0; i < 3; i++) {
      expect(reversalSteps(await rollPerVisitDemo())).toBe(0);
    }
  }, 120_000);
});
