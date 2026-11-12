// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { BrowseFilterType } from "#lib/shared/persistence/domain/enums/filtering-enums.js";
import { t } from "#lib/shared/i18n/i18n.svelte.js";
import { localizeFilterChip } from "./localize-filter-chip";

describe("the Mandala chip", () => {
  it("reads the category word, whatever label or value it was saved with", () => {
    const word = t("browse_ui_mandala_category");
    expect(word).toBe("Mandala");
    expect(
      localizeFilterChip({
        type: BrowseFilterType.MANDALA,
        value: "abc-12~seq-1",
        label: "Sparse mandala, 24%",
      })
    ).toBe(word);
    expect(
      localizeFilterChip({ type: BrowseFilterType.MANDALA, value: "abc-12", label: "" })
    ).toBe(word);
  });
});
