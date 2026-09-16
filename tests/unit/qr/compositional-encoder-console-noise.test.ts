import { describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

vi.mock("$lib/shared/create/get-loop-detector", () => ({
  getLoopDetector: () => ({
    detectLOOPType: () => ({
      loopType: "rotated",
      confidence: "strict",
      period: "quartered",
    }),
  }),
}));

vi.mock("$lib/shared/qr/services/compositional-utils", () => ({
  getLoopExecutor: async () => ({
    executeLOOP: () => {
      throw new Error("candidate cannot be reconstructed");
    },
  }),
  getPeriodForTag: () => "quartered",
  computeRecipeHash: async () => "hash",
  enrichStepsWithGridPlacements: () => {},
}));

import { CompositionalEncoder } from "$lib/shared/qr/services/compositional-encoder";

describe("CompositionalEncoder console behavior", () => {
  it("silently falls back when a strict candidate cannot be reconstructed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sequence = {
      word: "ABCD",
      steps: [{}, {}, {}, {}],
    } as SequenceData;
    const encoder = new CompositionalEncoder(
      { encode: () => "flat" },
      { decode: () => sequence },
      { compressString: (value) => value }
    );

    await expect(encoder.tryEncode("flat", sequence)).resolves.toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});
