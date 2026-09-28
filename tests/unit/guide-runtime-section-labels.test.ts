import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import de from "../../messages/de.json";
import { LEVEL2_SECTION_ANCHORS } from "../../src/routes/(public)/guide/level-2/_data/guide-manifest";

describe("Level 2 guide sidebar labels", () => {
  it("has an English and German label for every live section anchor", () => {
    for (const { sections } of LEVEL2_SECTION_ANCHORS) {
      for (const { id } of sections) {
        const key = `guide_runtime_section_${id.replaceAll("-", "_")}`;
        expect(
          en[key as keyof typeof en],
          `English label for ${id}`
        ).toBeTruthy();
        expect(
          de[key as keyof typeof de],
          `German label for ${id}`
        ).toBeTruthy();
      }
    }
  });
});
