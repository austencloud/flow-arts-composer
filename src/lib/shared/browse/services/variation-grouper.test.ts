import { describe, expect, it } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  groupByWord,
  variationGroupKey,
} from "./variation-grouper";

/** Minimal SequenceData for grouping (only word/name/id/dateAdded matter). */
function seq(overrides: Partial<SequenceData>): SequenceData {
  return {
    id: "id",
    name: "",
    word: "",
    steps: [],
    thumbnails: [],
    isFavorite: false,
    isCircular: false,
    tags: [],
    metadata: {},
    ...overrides,
  } as SequenceData;
}

describe("variationGroupKey", () => {
  it("collapses repeated words to the label (GGGG → G)", () => {
    expect(variationGroupKey(seq({ id: "canonical", word: "GGGG" }))).toBe("G");
  });

  it("keeps already-simple words as-is", () => {
    expect(variationGroupKey(seq({ id: "community", word: "G" }))).toBe("G");
  });

  it("collapses multi-letter repeats (ABAB → AB)", () => {
    expect(variationGroupKey(seq({ id: "x", word: "ABAB" }))).toBe("AB");
  });

  it("falls back to name, trims whitespace", () => {
    expect(variationGroupKey(seq({ id: "x", word: "", name: " CAKE " }))).toBe(
      "CAKE",
    );
  });

  it("returns null when neither word nor name exists", () => {
    expect(variationGroupKey(seq({ id: "x" }))).toBeNull();
  });
});

describe("groupByWord", () => {
  it("merges raw-word variants that share a label — the G bug", () => {
    // Community save stored "G"; canonical T&D seed stores "GGGG". Both cards
    // display "G", so they MUST be one group (Austen, 2026-07-02).
    const community = seq({ id: "community-g", word: "G" });
    const canonical = seq({ id: "tnd-tog-same-gggg__t_0-0", word: "GGGG" });
    const other = seq({ id: "other", word: "AB" });

    const groups = groupByWord([community, canonical, other]);

    expect(groups.get("G")?.map((s) => s.id).sort()).toEqual([
      "community-g",
      "tnd-tog-same-gggg__t_0-0",
    ]);
    expect(groups.has("GGGG")).toBe(false);
    expect(groups.get("AB")?.length).toBe(1);
  });
});
