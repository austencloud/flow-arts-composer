import { describe, expect, it } from "vitest";
import type { SmartFilterSpec } from "#lib/shared/library/domain/models/collection.js";
import {
  SMART_COLLECTION_NAME_MAX_LENGTH,
  suggestSmartCollectionName,
} from "#lib/shared/browse/services/smart-collection-name.js";

function spec(...labels: string[]): SmartFilterSpec {
  return {
    source: "community",
    filters: labels.map((label, index) => ({
      key: `filter-${index}`,
      type: "test",
      value: index,
      label,
      chipColor: "#6aa0ff",
    })),
    sortMethod: "recent",
    sortDirection: "desc",
  };
}

describe("suggestSmartCollectionName", () => {
  it("uses the visible filter labels in rule order", () => {
    expect(
      suggestSmartCollectionName(spec("Level 1", "8 steps", "Mirrored"))
    ).toBe("Level 1 · 8 steps · Mirrored");
  });

  it("summarizes additional filters without hiding how many remain", () => {
    expect(
      suggestSmartCollectionName(
        spec("Level 1", "8 steps", "Mirrored", "Alpha", "Diamond")
      )
    ).toBe("Level 1 · 8 steps · Mirrored +2");
  });

  it("normalizes whitespace and removes repeated labels", () => {
    expect(
      suggestSmartCollectionName(spec("  Level   1  ", "level 1", "8 steps"))
    ).toBe("Level 1 · 8 steps");
  });

  it("keeps long names within the collection limit", () => {
    const name = suggestSmartCollectionName(
      spec(
        "Workshop combinations with a deliberately very long criterion label",
        "Mirrored"
      )
    );

    expect(name.length).toBeLessThanOrEqual(SMART_COLLECTION_NAME_MAX_LENGTH);
    expect(name).toMatch(/… \+1$/);
  });

  it("adds the first available copy number for an existing title", () => {
    expect(
      suggestSmartCollectionName(spec("Level 1"), ["Level 1", "Level 1 (2)"])
    ).toBe("Level 1 (3)");
  });

  it("provides a stable fallback before filters are added", () => {
    expect(suggestSmartCollectionName(spec())).toBe("Smart Collection");
  });
});
