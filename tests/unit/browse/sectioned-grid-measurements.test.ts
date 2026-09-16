import { describe, expect, it } from "vitest";
import {
  createSectionedGridMeasurementSignature,
  getSectionedGridItemKey,
  getSectionedGridRowMaxSteps,
  type SectionedGridMeasurementItem,
} from "$lib/shared/browse/components/sectioned-grid-measurements";

function row(
  key: string,
  sequenceLengths: readonly number[]
): SectionedGridMeasurementItem {
  return {
    type: "row",
    key,
    sequences: sequenceLengths.map((sequenceLength) => ({ sequenceLength })),
  };
}

describe("sectioned grid measurement identity", () => {
  it("invalidates an equal-length stream when a short row is replaced by a tall row", () => {
    const before: SectionedGridMeasurementItem[] = [
      { type: "header", key: "h-letter-c|8" },
      row("r-letter-c|8-0", [8]),
      { type: "header", key: "h-letter-i|12" },
      row("r-letter-i|12-0", [12]),
    ];
    const after: SectionedGridMeasurementItem[] = [
      { type: "header", key: "h-letter-a|16" },
      row("r-letter-a|16-0", [16]),
      { type: "header", key: "h-letter-i|12" },
      row("r-letter-i|12-0", [12]),
    ];

    expect(after).toHaveLength(before.length);
    expect(createSectionedGridMeasurementSignature(before, 5, "row")).not.toBe(
      createSectionedGridMeasurementSignature(after, 5, "row")
    );
  });

  it("invalidates a persistent row when its tallest card changes", () => {
    const before = [row("r-author-austen-0", [4, 8])];
    const after = [row("r-author-austen-0", [4, 16])];

    expect(getSectionedGridRowMaxSteps(before[0]?.sequences ?? [])).toBe(8);
    expect(getSectionedGridRowMaxSteps(after[0]?.sequences ?? [])).toBe(16);
    expect(createSectionedGridMeasurementSignature(before, 2, "row")).not.toBe(
      createSectionedGridMeasurementSignature(after, 2, "row")
    );
  });

  it("invalidates when the start-placement layout changes", () => {
    const items = [row("r-letter-a|16-0", [16])];

    expect(createSectionedGridMeasurementSignature(items, 5, "row")).not.toBe(
      createSectionedGridMeasurementSignature(items, 5, "column")
    );
  });

  it("uses the flattened data key instead of the recycled numeric index", () => {
    const before = [row("r-letter-c|8-0", [8])];
    const after = [row("r-letter-a|16-0", [16])];

    expect(getSectionedGridItemKey(before, 0)).toBe("r-letter-c|8-0");
    expect(getSectionedGridItemKey(after, 0)).toBe("r-letter-a|16-0");
    expect(getSectionedGridItemKey(after, 99)).toBe(99);
  });
});
