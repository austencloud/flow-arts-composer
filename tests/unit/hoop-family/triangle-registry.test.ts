import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { SMALL_UNILATERAL_PROPS } from "$lib/shared/pictograph/prop/domain/enums/prop-classification";
import {
  BASE_TO_VARIANTS,
  getBasePropType,
  getPropTypeDisplayInfo,
  PROP_PICKER_SECTIONS,
  VARIANT_PROP_TYPES,
} from "$lib/shared/pictograph/prop/domain/prop-type-display-registry";
import {
  encodePropForURL,
  parsePropTypeFromURLValue,
} from "$lib/shared/navigation/services/sequence-encoder";
import { SELECTIVE_COLOR_PROP_TYPES } from "$lib/shared/utils/svg-color-utils";

describe("triangle registry membership", () => {
  it("is a small one-handed prop in the hoop family", () => {
    expect(PropType.TRIANGLE).toBe("triangle");
    expect(SMALL_UNILATERAL_PROPS as readonly string[]).toContain("triangle");
    expect(getBasePropType(PropType.TRIANGLE)).toBe(PropType.MINIHOOP);
    expect(BASE_TO_VARIANTS[PropType.MINIHOOP]).toEqual([
      PropType.BIGHOOP,
      PropType.TRIANGLE,
    ]);
    expect(VARIANT_PROP_TYPES).toContain(PropType.TRIANGLE);
    expect(getPropTypeDisplayInfo(PropType.TRIANGLE)).toEqual({
      label: "Triangle",
      image: "/images/props/buttons/triangle.svg",
    });
  });

  it("is listed once in the picker, under Standard", () => {
    const sections = PROP_PICKER_SECTIONS.filter((s) =>
      s.props.includes(PropType.TRIANGLE)
    );
    expect(sections.map((s) => s.label)).toEqual(["Standard"]);
  });

  it("encodes as the digit 8 and round-trips", () => {
    expect(encodePropForURL(PropType.TRIANGLE)).toBe("8");
    expect(parsePropTypeFromURLValue("8")).toBe(PropType.TRIANGLE);
    expect(parsePropTypeFromURLValue("triangle")).toBe(PropType.TRIANGLE);
  });

  it("recolors selectively so the black elbows and gold band survive", () => {
    for (const prop of ["minihoop", "bighoop", "triangle"]) {
      expect(SELECTIVE_COLOR_PROP_TYPES as readonly string[]).toContain(prop);
    }
  });

  it("seeds arrow placements as a copy of the mini hoop's", () => {
    for (const mt of ["anti", "dash", "float", "pro", "static"]) {
      const a = readFileSync(
        `static/data/arrow_placement/default/minihoop/default_${mt}_placements.json`,
        "utf8"
      );
      const b = readFileSync(
        `static/data/arrow_placement/default/triangle/default_${mt}_placements.json`,
        "utf8"
      );
      expect(b, mt).toBe(a);
    }
  });

  it("keeps the seeded prop lists in sync", () => {
    const placer = readFileSync(
      "src/lib/shared/pictograph/arrow/positioning/placement/services/arrow-placer.ts",
      "utf8"
    );
    const seed = readFileSync("scripts/seed-prop-default-placements.mjs", "utf8");
    expect(placer).toMatch(/"triangle",/);
    expect(seed).toMatch(/"triangle",/);
  });
});
