import { describe, expect, it } from "vitest";
import { normalizeFestivalPackCount } from "#lib/features/choreo-card/components/deck-releaser/state/festival-sampler-print-state.svelte.js";

describe("normalizeFestivalPackCount", () => {
  it("keeps a sixty-pack batch intact", () => {
    expect(normalizeFestivalPackCount(60)).toBe(60);
  });

  it("rounds and constrains custom batch sizes", () => {
    expect(normalizeFestivalPackCount(12.6)).toBe(13);
    expect(normalizeFestivalPackCount(0)).toBe(1);
    expect(normalizeFestivalPackCount(500)).toBe(60);
    expect(normalizeFestivalPackCount(Number.NaN)).toBe(60);
  });
});
