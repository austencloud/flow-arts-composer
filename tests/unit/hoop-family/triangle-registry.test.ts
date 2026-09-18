import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  SMALL_UNILATERAL_PROPS,
  isUnilateralProp as isUnilateralPropDomain,
} from "$lib/shared/pictograph/prop/domain/enums/prop-classification";
import { isUnilateralProp as isUnilateralPropRenderCore } from "$lib/shared/render/core/constants/prop-classification";
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
import {
  applyMotionColorToSvg,
  getMotionColor,
  isUnilateralProp as isUnilateralPropPackage,
  SELECTIVE_COLOR_PROP_TYPES,
} from "@tka/render-core";

describe("triangle registry membership", () => {
  it("is a small one-handed prop in the hoop family", () => {
    expect(SMALL_UNILATERAL_PROPS as readonly string[]).toContain("triangle");
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

  it("recolors selectively so the black hardware survives", () => {
    expect(SELECTIVE_COLOR_PROP_TYPES).toContain("triangle");

    const svgText = readFileSync(
      "static/images/props/pictograph/triangle.svg",
      "utf8"
    );
    // Derived from the list, not hard-coded: drop "triangle" from
    // SELECTIVE_COLOR_PROP_TYPES and this flag goes false, the whole SVG
    // gets flatly recolored, and the #1C1C1F assertion below fails.
    const recolored = applyMotionColorToSvg(svgText, "left", {
      selectiveColorMode: SELECTIVE_COLOR_PROP_TYPES.includes("triangle"),
    });

    // The neutral tube gets repainted to the hand colour.
    expect(recolored.toLowerCase()).not.toContain("#9a9a9a");
    expect(recolored).toContain(getMotionColor("left", "dark"));

    // The black elbows/button are dark enough that selective mode preserves
    // them as authored. This is the discriminating assertion.
    expect(recolored).toContain("#1C1C1F");

    // The gold grip band (#C9AC68) is separately listed in
    // ACCENT_COLORS_TO_PRESERVE, so it survives even in non-selective mode;
    // it does not discriminate on SELECTIVE_COLOR_PROP_TYPES membership.
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

  it("classifies triangle as unilateral in all three copies", () => {
    // Behavioural, not a full-list comparison: the three SMALL_UNILATERAL_PROPS
    // copies legitimately disagree on classic_club until that is reconciled as
    // its own change (it feeds calculateBetaOffset's live render math, so it
    // is not something to fix incidentally alongside triangle). This only
    // asserts what this task actually needs: triangle reads as unilateral
    // everywhere, and a real bilateral control (staff) does not.
    for (const isUnilateral of [
      isUnilateralPropDomain,
      isUnilateralPropRenderCore,
      isUnilateralPropPackage,
    ]) {
      expect(isUnilateral("triangle")).toBe(true);
      expect(isUnilateral("staff")).toBe(false);
    }
  });
});
