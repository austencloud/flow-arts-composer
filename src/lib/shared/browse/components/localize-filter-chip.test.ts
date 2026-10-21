// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { BrowseFilterType } from "#lib/shared/persistence/domain/enums/filtering-enums.js";
import { localizeFilterChip } from "./localize-filter-chip";

describe("the Mandala chip", () => {
  it("keeps its saved label while the index does not know the key", () => {
    expect(
      localizeFilterChip({
        type: BrowseFilterType.MANDALA,
        value: "unknown-key",
        label: "Sparse mandala, 24%",
      })
    ).toBe("Sparse mandala, 24%");
  });
});
