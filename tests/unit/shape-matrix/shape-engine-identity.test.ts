import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  KINETIC_SHAPE_ENGINE_AUTHOR,
  KINETIC_SHAPE_ENGINE_NAME,
  ORIGINAL_SHAPE_MATRIX_NAME,
  ORIGINAL_SHAPE_MATRIX_URL,
  ORIGINAL_SHAPE_MATRIX_VTG_RATIOS,
  SHAPE_ENGINE_SHORT_NAME,
  SHAPE_MATRIX_EXPLORER_LEGACY_NAME,
} from "#lib/shared/shape-matrix/app/shape-engine-identity.js";

function read(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

// German i18n work (commit d299d3c492) moved many of this surface's English
// literals behind t() keys backed by messages/en.json. Where a test used to
// assert an inline literal, it now asserts the source calls the key AND that
// messages/en.json still carries the identical original English copy, so the
// contract still fails if either the wiring or the wording drifts.
function readEnglishMessages(): Record<string, string> {
  return JSON.parse(read("messages/en.json")) as Record<string, string>;
}

describe("Shape Engine identity", () => {
  it("keeps the product name distinct from its matrix surfaces and legacy name", () => {
    expect(KINETIC_SHAPE_ENGINE_NAME).toBe("Shape Engine");
    expect(KINETIC_SHAPE_ENGINE_AUTHOR).toBe("Austen Cloud");
    expect(SHAPE_ENGINE_SHORT_NAME).toBe("Shape Engine");
    expect(SHAPE_MATRIX_EXPLORER_LEGACY_NAME).toBe("Shape Matrix Explorer");

    const page = read("src/routes/(public)/shape-engine/+page.svelte");
    const shell = read(
      "src/lib/shared/shape-matrix/app/components/ShapeMatrixAppShell.svelte"
    );
    const surface = read(
      "src/lib/shared/shape-matrix/app/components/ShapeMatrixSurfaceControl.svelte"
    );

    expect(page).toContain("KINETIC_SHAPE_ENGINE_NAME");
    expect(page).toContain("SHAPE_MATRIX_EXPLORER_LEGACY_NAME");
    expect(shell).toContain("{KINETIC_SHAPE_ENGINE_NAME}");
    // The compact header's theory/matrix label switch moved behind i18n keys.
    expect(shell).toContain('t("shape_engine_ratio_playground")');
    expect(shell).toContain('t("shape_engine_level_matrix")');
    expect(surface).toContain('ariaLabel={t("shape_engine_choose_mode")}');
    expect(surface).toContain('t("shape_engine_level_matrix")');
    expect(surface).toContain('t("shape_engine_explore_levels")');
    expect(surface).toContain('t("shape_engine_ratio_playground")');

    const en = readEnglishMessages();
    expect(en["shape_engine_choose_mode"]).toBe("Choose a Shape Engine mode");
    expect(en["shape_engine_level_matrix"]).toBe("Level Matrix");
    expect(en["shape_engine_explore_levels"]).toBe("Explore Levels 1–4");
    expect(en["shape_engine_ratio_playground"]).toBe("Ratio Playground");
  });

  it("keeps Lorq Nichols' source visible and the independent-work boundary explicit", () => {
    expect(ORIGINAL_SHAPE_MATRIX_NAME).toBe("144 Shape Matrix");
    expect(ORIGINAL_SHAPE_MATRIX_URL).toContain("spinscience.xyz");
    expect(ORIGINAL_SHAPE_MATRIX_VTG_RATIOS).toBe("1:1, 1:3, and 1:5");

    const page = read("src/routes/(public)/shape-engine/+page.svelte");
    const shell = read(
      "src/lib/shared/shape-matrix/app/components/ShapeMatrixAppShell.svelte"
    );
    const surface = read(
      "src/lib/shared/shape-matrix/app/components/ShapeMatrixSurfaceControl.svelte"
    );
    const about = read(
      "src/lib/shared/shape-matrix/app/components/ShapeMatrixAboutModal.svelte"
    );
    const menu = read(
      "src/lib/shared/shape-matrix/app/components/ShapeMatrixOverflowMenu.svelte"
    );

    expect(page).toContain('"isBasedOn"');
    expect(page).toContain('"name": "Lorq Nichols"');
    expect(page).toContain("ORIGINAL_SHAPE_MATRIX_VTG_RATIOS");
    // The topbar's direct source link moved into the About modal during the
    // 2026-09-06 demo-layout redesign (commit 31a3411642); the credit itself
    // did not disappear; it consolidated behind the always-visible About
    // action, whose content the assertions below still verify in full.
    // German i18n work (commit d299d3c492) then moved these English literals
    // behind t() keys; check the source calls the key AND messages/en.json
    // still carries the identical original English copy.
    expect(shell).toContain('aria-label={t("shape_engine_about_name")}');
    expect(surface).toContain('t("shape_engine_build_four")');
    expect(shell).not.toContain("prop:hand ratios");
    expect(about).toContain('<h2>{t("shape_engine_source_heading")}</h2>');
    // The 2026-09-06 demo-layout rewrite (commit 31a3411642) reworded the
    // petal-math explanation but kept the same twelve-per-hand, 144-total
    // fact; check the surviving phrasing rather than the retired copy.
    expect(about).toContain('t("shape_engine_source_after")');
    expect(about).not.toContain("prop rotations : hand cycles");
    // Same rewrite merged the standalone "What Austen Cloud built" section
    // into this one; the independent-work sentence itself is unchanged.
    expect(about).toContain('t("shape_engine_independence_prose")');
    expect(about).toContain("KINETIC_SHAPE_ENGINE_AUTHOR");
    expect(menu).toContain('t("shape_engine_original_matrix")');

    const en = readEnglishMessages();
    expect(en["shape_engine_about_name"]).toBe("About Shape Engine");
    expect(en["shape_engine_build_four"]).toBe("Build your own 4×4");
    expect(en["shape_engine_source_heading"]).toBe(
      "Lorq Nichols’ 144 Shape Matrix"
    );
    expect(en["shape_engine_source_after"]).toMatch(
      /pairs twelve driving styles for each hand into 144 combinations/
    );
    expect(en["shape_engine_independence_prose"]).toContain(
      "Austen built this app independently"
    );
    expect(en["shape_engine_independence_prose"]).toMatch(
      /not an official Spin Science release/
    );
    expect(en["shape_engine_original_matrix"]).toBe(
      "Lorq Nichols’ original 144 Shape Matrix"
    );
  });

  it("uses the Shape Engine name at entry points without renaming Lorq's work", () => {
    const header = read("src/lib/shared/landing/components/SiteHeader.svelte");
    const catalog = read("src/lib/shared/notation/notation-catalog.ts");

    expect(header).toContain('label: "Shape Engine"');
    expect(catalog).toContain('label: "Shape Engine"');
    expect(catalog).toContain('name: "144 Shape Matrix"');
  });
});
