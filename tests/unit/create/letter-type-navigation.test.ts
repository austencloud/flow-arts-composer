import { describe, expect, it } from "vitest";
import { buildLetterTypeGroupPanels } from "#lib/features/create/construct/option-picker/services/letter-type-navigation.js";
import {
  getLetterTypeGroupPresentation,
  LETTER_TYPE_GROUP_DESCRIPTORS,
  LETTER_TYPE_DESCRIPTORS,
} from "#lib/features/create/construct/option-picker/services/section-title-formatter.js";
import type { OrganizedSection } from "#lib/features/create/construct/option-picker/domain/option-picker-types.js";

function section(title: string, ids: string[]): OrganizedSection {
  return {
    title,
    pictographs: ids.map((id) => ({ id }) as never),
    type: "section",
  };
}

describe("letter type navigation", () => {
  it("always returns the four visible letter-type groups in selector order", () => {
    const panels = buildLetterTypeGroupPanels([]);

    expect(panels.map((panel) => panel.title)).toEqual(
      LETTER_TYPE_GROUP_DESCRIPTORS.map((group) => group.key)
    );
    expect(panels.every((panel) => panel.pictographs.length === 0)).toBe(true);
  });

  it("derives group presentation from resolved letter-type descriptions", () => {
    expect(LETTER_TYPE_DESCRIPTORS.Type1).toMatchObject({
      key: "Type1",
      typeName: "Type 1",
      description: "Dual-Shift",
      translationKey: "create_type_dual_shift",
      coloredParts: [
        { text: "Dual", color: "#00b3ff" },
        { text: "-" },
        { text: "Shift", color: "#6F2DA8" },
      ],
    });

    const presentation = getLetterTypeGroupPresentation(
      LETTER_TYPE_GROUP_DESCRIPTORS[3]!,
      (descriptor) => `Traduit-${descriptor.description}`
    );

    expect(presentation).toEqual({
      accessibleName:
        "Types 4-6: Traduit-Dash, Traduit-Dual-Dash, Traduit-Static",
      coloredParts: [
        { text: "Traduit", color: "currentColor" },
        { text: "-" },
        { text: "Dash", color: "#26e600" },
        { text: ", " },
        { text: "Traduit", color: "currentColor" },
        { text: "-" },
        { text: "Dual", color: "#00b3ff" },
        { text: "-" },
        { text: "Dash", color: "#26e600" },
        { text: ", " },
        { text: "Traduit", color: "currentColor" },
        { text: "-" },
        { text: "Static", color: "#eb7d00" },
      ],
      paletteColors: ["#26e600", "#00b3ff", "#eb7d00"],
    });
  });

  it("keeps an empty group in place after filtering", () => {
    const panels = buildLetterTypeGroupPanels([
      section("Type1", ["a"]),
      section("Type3", ["b"]),
    ]);

    expect(panels[1]).toMatchObject({
      title: "Type2",
      pictographs: [],
    });
  });

  it("combines Types 4, 5, and 6 without changing their order", () => {
    const panels = buildLetterTypeGroupPanels([
      section("Type4", ["dash"]),
      section("Type5", ["dual-dash"]),
      section("Type6", ["static"]),
    ]);

    expect(panels[3]?.pictographs.map((pictograph) => pictograph.id)).toEqual([
      "dash",
      "dual-dash",
      "static",
    ]);
  });
});
