import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { SMALL_UNILATERAL_PROPS as SMALL_UNILATERAL_PROPS_DOMAIN } from "$lib/shared/pictograph/prop/domain/enums/prop-classification";
import { SMALL_UNILATERAL_PROPS as SMALL_UNILATERAL_PROPS_RENDER_CORE } from "$lib/shared/render/core/constants/prop-classification";
import { SMALL_UNILATERAL_PROPS as SMALL_UNILATERAL_PROPS_PACKAGE } from "../../../packages/render-core/src/constants/prop-classification";
import {
  getAllVariations,
  getBasePropType,
  getPropTypeDisplayInfo,
  PROP_PICKER_SECTIONS,
  VARIANT_PROP_TYPES,
} from "$lib/shared/pictograph/prop/domain/prop-type-display-registry";
import { getCompositionRecipe } from "$lib/shared/pictograph/prop/domain/prop-composition-recipes";
import {
  encodePropForURL,
  parsePropTypeFromURLValue,
} from "$lib/shared/navigation/services/sequence-encoder";
import { applyMotionColorToSvg, getMotionColor } from "@tka/render-core";

describe("triangle registry membership", () => {
  it("is a small one-handed prop in the hoop family", () => {
    expect(SMALL_UNILATERAL_PROPS_DOMAIN as readonly string[]).toContain(
      "triangle"
    );
    expect(getBasePropType(PropType.TRIANGLE)).toBe(PropType.MINIHOOP);
    expect(getAllVariations(PropType.MINIHOOP)).toEqual([
      PropType.MINIHOOP,
      PropType.BIGHOOP,
      PropType.TRIANGLE,
    ]);
    expect(VARIANT_PROP_TYPES).toContain(PropType.TRIANGLE);
    expect(getPropTypeDisplayInfo(PropType.TRIANGLE).image).toMatch(
      /\/buttons\/triangle\.svg$/
    );
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

  it("gets its own composition recipe instead of inheriting the mini hoop's Venn", () => {
    // Bug: getCompositionRecipe's non-compact path checked the base family's
    // recipe before the prop's own, so a variant with its own entry (like
    // triangle) could never reach it. Fixed to check propType first, base
    // second, matching the compact path's own precedence.
    const triangleRecipe = getCompositionRecipe(PropType.TRIANGLE);
    expect(triangleRecipe.right.rotation).toBe(180);

    // Bighoop has no recipe of its own, so it must still inherit minihoop's.
    expect(getCompositionRecipe(PropType.BIGHOOP)).toEqual(
      getCompositionRecipe(PropType.MINIHOOP)
    );
  });

  it("recolors selectively so the black elbows and gold band survive", () => {
    const svgText = readFileSync(
      "static/images/props/pictograph/triangle.svg",
      "utf8"
    );
    const recolored = applyMotionColorToSvg(svgText, "left", {
      selectiveColorMode: true,
    });

    // The neutral tube gets repainted to the hand colour.
    expect(recolored.toLowerCase()).not.toContain("#9a9a9a");
    expect(recolored).toContain(getMotionColor("left", "dark"));

    // The black elbows/button and the gold grip band are dark/saturated
    // enough that selective mode preserves them as authored.
    expect(recolored).toContain("#1C1C1F");
    expect(recolored).toContain("#C9AC68");
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

  it("keeps the three SMALL_UNILATERAL_PROPS copies in sync", () => {
    const domain = new Set(SMALL_UNILATERAL_PROPS_DOMAIN as readonly string[]);
    const renderCore = new Set(
      SMALL_UNILATERAL_PROPS_RENDER_CORE as readonly string[]
    );
    const pkg = new Set(SMALL_UNILATERAL_PROPS_PACKAGE as readonly string[]);

    expect(renderCore).toEqual(domain);
    expect(pkg).toEqual(domain);

    expect(domain.has("triangle")).toBe(true);
    expect(renderCore.has("triangle")).toBe(true);
    expect(pkg.has("triangle")).toBe(true);
  });
});
