/**
 * Energy Saber / Energy Staff: a Sword style and a Double Staff style.
 *
 * Everything here guards a failure that produces plausible-looking output
 * instead of an obvious break: a prop that silently traces the wrong reach, a
 * blade that never changes color, a short code that decodes to the wrong prop,
 * or a style that drifts out of its parent's family in the picker. None of
 * those announce themselves on screen.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  PROP_PICKER_SECTIONS,
  VARIANT_PROP_TYPES,
  findPropTypeByValue,
  getAllVariations,
  getBasePropType,
  getBasePropsByCategory,
  getNextVariation,
  getPropTypeDisplayInfo,
} from "#lib/shared/pictograph/prop/domain/prop-type-display-registry.js";
import {
  isBigProp,
  isBilateralProp,
  isSmallProp,
  isUnilateralProp,
  getBilateralEndLabels,
  getBetaOffsetSize,
} from "#lib/shared/pictograph/prop/domain/enums/prop-classification.js";
import { isUnilateralProp as isUnilateralPropRenderCore } from "#lib/shared/render/core/constants/prop-classification.js";
import { propTipEnds } from "#lib/shared/pictograph/prop/domain/prop-tip-ends.js";
import { getTipPointsBaseline } from "#lib/shared/animation-engine/domain/types/prop-tip-points.js";
import { getPropDimensions } from "#lib/shared/animation-engine/services/IPropTextureLoader.js";
import { getCompositionRecipe } from "#lib/shared/pictograph/prop/domain/prop-composition-recipes.js";
import {
  applyMotionColorToSvg,
  SELECTIVE_COLOR_PROP_TYPES,
} from "#lib/shared/utils/svg-color-utils.js";

const REPO_ROOT = join(__dirname, "..", "..");

const ENERGY_PROPS = [PropType.ENERGY_SABER, PropType.ENERGY_STAFF] as const;

/** Every folder a consumer reads a prop out of. A miss in any one is a 404. */
const ASSET_FAMILIES = [
  "static/images/props/pictograph",
  "static/images/props/animated",
  "static/images/props/buttons",
  "static/images/props",
  "mcp-server-pkg/assets/images/props/pictograph",
  "mcp-server-pkg/assets/images/props/animated",
  "mcp-server-pkg/assets/images/props/buttons",
  "mcp-server-pkg/assets/images/props",
];

function readPropSvg(id: string): string {
  return readFileSync(
    join(REPO_ROOT, "static/images/props/pictograph", `${id}.svg`),
    "utf-8"
  );
}

function parseViewBox(svg: string): { width: number; height: number } {
  const match = svg.match(/viewBox\s*=\s*"([^"]+)"/i);
  if (!match) throw new Error("no viewBox");
  const parts = match[1]!.trim().split(/\s+/).map(Number);
  return { width: parts[2]!, height: parts[3]! };
}

// ───────────────────────────────────────────────────────────────────────────
// Assets
// ───────────────────────────────────────────────────────────────────────────

describe("energy prop assets", () => {
  it.each(ENERGY_PROPS)(
    "%s ships in every asset family the product reads",
    (prop) => {
      for (const family of ASSET_FAMILIES) {
        const path = join(REPO_ROOT, family, `${prop}.svg`);
        expect(existsSync(path), `missing ${family}/${prop}.svg`).toBe(true);
      }
    }
  );

  it.each(ENERGY_PROPS)(
    "%s is byte-identical across every family, so no consumer sees a different prop",
    (prop) => {
      const canonical = readPropSvg(prop);
      for (const family of ASSET_FAMILIES) {
        const contents = readFileSync(
          join(REPO_ROOT, family, `${prop}.svg`),
          "utf-8"
        );
        expect(contents, `${family}/${prop}.svg drifted`).toBe(canonical);
      }
    }
  );

  it.each(ENERGY_PROPS)("%s carries no animation or script", (prop) => {
    const svg = readPropSvg(prop);
    expect(svg).not.toMatch(/<animate|<script/i);
  });

  it.each(ENERGY_PROPS)("%s stays under the 12 KB budget", (prop) => {
    expect(Buffer.byteLength(readPropSvg(prop), "utf-8")).toBeLessThan(12_288);
  });

  it("does not use the sword- prefix, which routes to the animated-only carve-out", () => {
    for (const prop of ENERGY_PROPS) {
      expect(prop.startsWith("sword-")).toBe(false);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Physical behavior: each prop follows its own parent
// ───────────────────────────────────────────────────────────────────────────

describe("energy prop physical behavior", () => {
  it("Energy Saber is classified with sword: big and bilateral, never unilateral", () => {
    expect(isBigProp(PropType.ENERGY_SABER)).toBe(true);
    expect(isBilateralProp(PropType.ENERGY_SABER)).toBe(true);
    expect(isUnilateralProp(PropType.ENERGY_SABER)).toBe(false);
    expect(isBigProp(PropType.SWORD)).toBe(true);
    expect(isBilateralProp(PropType.SWORD)).toBe(true);
  });

  it("Energy Staff is classified with staff: small and bilateral, never unilateral", () => {
    expect(isSmallProp(PropType.ENERGY_STAFF)).toBe(true);
    expect(isBilateralProp(PropType.ENERGY_STAFF)).toBe(true);
    expect(isUnilateralProp(PropType.ENERGY_STAFF)).toBe(false);
    expect(isSmallProp(PropType.STAFF)).toBe(true);
    expect(isBilateralProp(PropType.STAFF)).toBe(true);
  });

  it("render-core agrees both are bilateral (it treats anything non-unilateral as bilateral)", () => {
    // The two classification copies fail differently: the app copy leaves an
    // unlisted prop neither unilateral nor bilateral, render-core defaults it to
    // bilateral. Both must land on bilateral for the beta offset to match.
    expect(isUnilateralPropRenderCore(PropType.ENERGY_SABER)).toBe(false);
    expect(isUnilateralPropRenderCore(PropType.ENERGY_STAFF)).toBe(false);
  });

  it("beta offset matches each parent", () => {
    expect(getBetaOffsetSize(PropType.ENERGY_SABER)).toBe(
      getBetaOffsetSize(PropType.SWORD)
    );
    expect(getBetaOffsetSize(PropType.ENERGY_STAFF)).toBe(
      getBetaOffsetSize(PropType.STAFF)
    );
  });

  it("Energy Saber traces ONE tip; the default of 2 would grow a phantom blade out the hilt", () => {
    expect(propTipEnds(PropType.ENERGY_SABER)).toBe(1);
    expect(propTipEnds(PropType.SWORD)).toBe(1);
  });

  it("Energy Staff traces TWO tips, like staff", () => {
    expect(propTipEnds(PropType.ENERGY_STAFF)).toBe(2);
    expect(propTipEnds(PropType.STAFF)).toBe(2);
  });

  it("tip count and tip-point count agree (two registries, one truth)", () => {
    for (const prop of ENERGY_PROPS) {
      expect(getTipPointsBaseline(prop).points).toHaveLength(propTipEnds(prop));
    }
  });

  it("Energy Saber reaches exactly as far as sword", () => {
    const saber = getTipPointsBaseline(PropType.ENERGY_SABER).points;
    const sword = getTipPointsBaseline(PropType.SWORD).points;
    expect(saber).toEqual(sword);
  });

  it("Energy Staff reaches exactly as far as staff, on both ends", () => {
    const energy = getTipPointsBaseline(PropType.ENERGY_STAFF).points;
    const staff = getTipPointsBaseline(PropType.STAFF).points;
    expect(energy).toEqual(staff);
  });

  it("neither prop falls back to the staff default tip config", () => {
    // getTipPoints falls back to STAFF_TIP_POINTS, so a missing entry would
    // look correct for Energy Staff and quietly wrong for Energy Saber.
    const fallbackShape = getTipPointsBaseline("a-prop-that-does-not-exist");
    expect(getTipPointsBaseline(PropType.ENERGY_SABER)).not.toEqual(
      fallbackShape
    );
  });

  it.each(ENERGY_PROPS)(
    "%s dimensions match its shipped viewBox, so first paint does not pop",
    (prop) => {
      const viewBox = parseViewBox(readPropSvg(prop));
      expect(getPropDimensions(prop)).toEqual(viewBox);
    }
  );

  it.each(ENERGY_PROPS)(
    "%s tips stay inside the viewBox, so the pivot is genuinely centered",
    (prop) => {
      const { width, height } = getPropDimensions(prop);
      for (const point of getTipPointsBaseline(prop).points) {
        expect(Math.abs(point.dx)).toBeLessThanOrEqual(width / 2);
        expect(Math.abs(point.dy)).toBeLessThanOrEqual(height / 2);
      }
    }
  );

  it("end labels follow each parent's vocabulary", () => {
    expect(getBilateralEndLabels(PropType.ENERGY_SABER)).toEqual(
      getBilateralEndLabels(PropType.SWORD)
    );
    expect(getBilateralEndLabels(PropType.ENERGY_STAFF)).toEqual(
      getBilateralEndLabels(PropType.STAFF)
    );
    expect(getBilateralEndLabels(PropType.ENERGY_STAFF)).toEqual([
      "Pinky End",
      "Thumb End",
    ]);
  });

  it.each(ENERGY_PROPS)(
    "%s gets a crossed pair preview, not the generic fallback",
    (prop) => {
      const recipe = getCompositionRecipe(prop);
      expect(recipe.left.rotation).toBe(-recipe.right.rotation);
      expect(recipe.left.rotation).not.toBe(10);
    }
  );
});

// ───────────────────────────────────────────────────────────────────────────
// Motion color: the blade recolors, the hilt and core do not
// ───────────────────────────────────────────────────────────────────────────

describe("energy prop motion coloring", () => {
  const BLUE = "#3575E2";
  const RED = "#ED1C24";

  function colorize(svg: string, hand: HandSide, prop: string) {
    return applyMotionColorToSvg(svg, hand, {
      makeClassNamesUnique: true,
      selectiveColorMode: (
        SELECTIVE_COLOR_PROP_TYPES as readonly string[]
      ).includes(prop),
    });
  }

  it("both props are registered for selective coloring", () => {
    for (const prop of ENERGY_PROPS) {
      expect(SELECTIVE_COLOR_PROP_TYPES as readonly string[]).toContain(prop);
    }
  });

  it.each(ENERGY_PROPS)("%s blade takes the motion color", (prop) => {
    const svg = readPropSvg(prop);
    const left = colorize(svg, HandSide.LEFT, prop);
    const right = colorize(svg, HandSide.RIGHT, prop);

    expect(left).toContain(BLUE);
    expect(right).toContain(RED);
    // The flat neutral grays are gone — every one of them became the motion color.
    for (const gray of ["#E4E4E4", "#DCDCDC", "#D0D0D0"]) {
      expect(left).not.toContain(gray);
      expect(right).not.toContain(gray);
    }
  });

  it.each(ENERGY_PROPS)(
    "%s pale core survives both colors unchanged",
    (prop) => {
      const svg = readPropSvg(prop);
      // A pure #FFFFFF core would be recolored in selective mode. The warm
      // near-white clears the saturation threshold and is preserved.
      expect(svg).toContain("#FFF6E8");
      expect(colorize(svg, HandSide.LEFT, prop)).toContain("#FFF6E8");
      expect(colorize(svg, HandSide.RIGHT, prop)).toContain("#FFF6E8");
    }
  );

  it.each(ENERGY_PROPS)("%s hilt stays neutral in both colors", (prop) => {
    const svg = readPropSvg(prop);
    const hiltFills = ["#24272E", "#3A3F49", "#4A505B", "#5C6470"];
    for (const hand of [HandSide.LEFT, HandSide.RIGHT] as const) {
      const out = colorize(svg, hand, prop);
      for (const fill of hiltFills) {
        if (!svg.includes(fill)) continue;
        expect(out, `${fill} was recolored`).toContain(fill);
      }
    }
  });

  it.each(ENERGY_PROPS)("%s blue and red renders actually differ", (prop) => {
    const svg = readPropSvg(prop);
    expect(colorize(svg, HandSide.LEFT, prop)).not.toBe(
      colorize(svg, HandSide.RIGHT, prop)
    );
  });

  it.each(ENERGY_PROPS)(
    "%s scopes every gradient and filter id per color, so two copies in one document cannot collide",
    (prop) => {
      const svg = readPropSvg(prop);
      for (const hand of [HandSide.LEFT, HandSide.RIGHT] as const) {
        const out = colorize(svg, hand, prop);
        const ids = [...out.matchAll(/id="([^"]+)"/g)].map((m) => m[1]!);
        expect(ids.length).toBeGreaterThan(0);
        for (const id of ids) {
          expect(id.endsWith(`-${hand}`), `${id} not scoped`).toBe(true);
        }
        const refs = [...out.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]!);
        expect(refs.length).toBeGreaterThan(0);
        for (const ref of refs) {
          expect(ref.endsWith(`-${hand}`), `url(#${ref}) not scoped`).toBe(
            true
          );
        }
      }
    }
  );

  it("the two props do not share any id, so a mixed pair cannot collide either", () => {
    const idsOf = (prop: string) =>
      new Set(
        [...readPropSvg(prop).matchAll(/id="([^"]+)"/g)].map((m) => m[1]!)
      );
    const saber = idsOf(PropType.ENERGY_SABER);
    const staff = idsOf(PropType.ENERGY_STAFF);
    for (const id of saber) expect(staff.has(id)).toBe(false);
  });

  it("a gradient-filled blade would be frozen gray — neither prop has one", () => {
    // stop-color is never rewritten, so any fill="url(#...)" region keeps its
    // authored color on both blue and red. Gradients are for sheen only.
    for (const prop of ENERGY_PROPS) {
      const svg = readPropSvg(prop);
      const gradientFilled = [...svg.matchAll(/fill="url\(#([^)]+)\)"/g)].map(
        (m) => m[1]!
      );
      for (const ref of gradientFilled) {
        expect(ref.toLowerCase()).toContain("sheen");
      }
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Family membership: each prop is a style of its parent
// ───────────────────────────────────────────────────────────────────────────

describe("energy prop families", () => {
  it("Energy Staff is a Double Staff style", () => {
    expect(getBasePropType(PropType.ENERGY_STAFF)).toBe(PropType.STAFF);
    expect(getAllVariations(PropType.STAFF)).toContain(PropType.ENERGY_STAFF);
  });

  it("Energy Saber is a Sword style", () => {
    expect(getBasePropType(PropType.ENERGY_SABER)).toBe(PropType.SWORD);
    expect(getAllVariations(PropType.SWORD)).toEqual([
      PropType.SWORD,
      PropType.ENERGY_SABER,
    ]);
  });

  it("both are variants, so no picker shows them as tiles of their own", () => {
    for (const prop of ENERGY_PROPS) {
      expect(VARIANT_PROP_TYPES).toContain(prop);
    }
  });

  it("the variant cycle steps Sword to Energy Saber and back", () => {
    expect(getNextVariation(PropType.SWORD)).toBe(PropType.ENERGY_SABER);
    expect(getNextVariation(PropType.ENERGY_SABER)).toBe(PropType.SWORD);
  });

  it("the picker lists both beside their parents, with no Premium section", () => {
    expect(PROP_PICKER_SECTIONS.map((section) => section.label)).not.toContain(
      "Premium"
    );
    const standard = PROP_PICKER_SECTIONS.find(
      (section) => section.label === "Standard"
    )!.props;
    for (const prop of ENERGY_PROPS) {
      expect(standard).toContain(prop);
      expect(standard).toContain(getBasePropType(prop));
    }
  });

  it("the category map lists the parents, never the styles", () => {
    const byCategory = [...getBasePropsByCategory().values()].flat();
    expect(byCategory).toContain(PropType.STAFF);
    expect(byCategory).toContain(PropType.SWORD);
    for (const prop of ENERGY_PROPS) {
      expect(byCategory).not.toContain(prop);
      expect(getPropTypeDisplayInfo(prop).category).toBeUndefined();
    }
  });

  it("saved settings still resolve, so an existing selection is never orphaned", () => {
    expect(findPropTypeByValue("energy_saber")).toBe(PropType.ENERGY_SABER);
    expect(findPropTypeByValue("ENERGY_STAFF")).toBe(PropType.ENERGY_STAFF);
  });

  it("public labels read as products, not identifiers", () => {
    expect(getPropTypeDisplayInfo(PropType.ENERGY_SABER).label).toBe(
      "Energy Saber"
    );
    expect(getPropTypeDisplayInfo(PropType.ENERGY_STAFF).label).toBe(
      "Energy Staff"
    );
  });

  it("button assets point at the files that exist", () => {
    for (const prop of ENERGY_PROPS) {
      expect(getPropTypeDisplayInfo(prop).image).toBe(
        `/images/props/buttons/${prop}.svg`
      );
    }
  });
});
