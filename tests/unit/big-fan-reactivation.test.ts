import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { UNLOCKABLE_POOL } from "#lib/shared/gamification/domain/prop-pool.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { getCompositionRecipe } from "#lib/shared/pictograph/prop/domain/prop-composition-recipes.js";
import {
  PROP_PICKER_SECTIONS,
  getAllVariations,
  getBasePropType,
  hasBigVariant,
  isBigVariant,
  isPropActive,
  toggleBigVariant,
} from "#lib/shared/pictograph/prop/domain/prop-type-display-registry.js";

describe("Big Fan reactivation", () => {
  it("is a size of Fan, reached from the dial rather than its own tile", () => {
    const standard = PROP_PICKER_SECTIONS.find(
      (section) => section.label === "Standard"
    );
    const big = PROP_PICKER_SECTIONS.find((section) => section.label === "Big");

    expect(isPropActive(PropType.BIGFAN)).toBe(true);
    // Size is a dial, not a prop. Big Fan is authored with the other bigs and
    // never stands beside Fan as a peer tile.
    expect(standard?.props).not.toContain(PropType.BIGFAN);
    expect(big?.props).toContain(PropType.BIGFAN);
    // It folds into the Fan tile the way every other big folds into its
    // standard counterpart, so the grid can hide it behind the size dock.
    expect(getBasePropType(PropType.BIGFAN)).toBe(PropType.FAN);
    expect(getAllVariations(PropType.FAN)).toEqual([
      PropType.FAN,
      PropType.BIGFAN,
    ]);
    expect(getAllVariations(PropType.BIGFAN)).toEqual([
      PropType.FAN,
      PropType.BIGFAN,
    ]);
  });

  it("toggles through the shared Fan size controls", () => {
    expect(hasBigVariant(PropType.FAN)).toBe(true);
    expect(isBigVariant(PropType.BIGFAN)).toBe(true);
    expect(toggleBigVariant(PropType.FAN)).toBe(PropType.BIGFAN);
    expect(toggleBigVariant(PropType.BIGFAN)).toBe(PropType.FAN);
  });

  it("shares the Fan tile composition", () => {
    expect(getCompositionRecipe(PropType.BIGFAN)).toEqual(
      getCompositionRecipe(PropType.FAN)
    );
  });

  it("remains claimable if prop locking is restored", () => {
    expect(UNLOCKABLE_POOL).toContain(PropType.BIGFAN);
  });

  it("keeps the 3D grip-to-rim scale aligned with the authored 2D asset", () => {
    // The scale is applied by the patched scene-3d package, so this asserts on
    // node_modules and every upstream refactor can move it. It used to live in
    // Prop3D.svelte as `const BIG_FAN_SCALE`; upstream replaced the per-prop
    // constants with one shared BIG_SCALE = 1.4 and moved the exceptions into
    // prop-model-registry, and the patch followed it there. Check both the src
    // and dist copies — Svelte resolves src via the `svelte` condition while
    // everything else runs dist, so a patch that lands in only one of them is
    // the failure mode this guards (see reference_scene3d_patch_workflow).
    const scaleEntry = /BIGFAN\]:\s*\{\s*base:\s*PropType\.FAN,\s*scale:\s*30 \/ 13\s*\}/;

    for (const copy of [
      "src/lib/components/props/prop-model-registry.ts",
      "dist/lib/components/props/prop-model-registry.js",
    ]) {
      const source = readFileSync(
        resolve(process.cwd(), "node_modules/@austencloud/scene-3d", copy),
        "utf8"
      );
      expect(source, `${copy} lost the patched big-fan scale`).toMatch(scaleEntry);
    }

    expect(600 / 260).toBe(30 / 13);
  });
});
