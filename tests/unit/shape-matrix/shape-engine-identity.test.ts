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
} from "$lib/shared/shape-matrix/app/shape-engine-identity";

function read(path: string): string {
  return readFileSync(resolve(path), "utf8");
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
    expect(shell).toContain('theory ? "Ratio Playground" : "Level Matrix"');
    expect(surface).toContain('ariaLabel="Choose a Shape Engine mode"');
    expect(surface).toContain('"Level Matrix"');
    expect(surface).toContain('"Explore Levels 1–4"');
    expect(surface).toContain('"Ratio Playground"');
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
    expect(shell).toContain("aria-label={`About ${KINETIC_SHAPE_ENGINE_NAME}`}");
    expect(surface).toContain("Build your own 4×4");
    expect(shell).not.toContain("prop:hand ratios");
    expect(about).toContain("<h2>Lorq Nichols’ 144 Shape Matrix</h2>");
    // The 2026-09-06 demo-layout rewrite (commit 31a3411642) reworded the
    // petal-math explanation but kept the same twelve-per-hand, 144-total
    // fact; check the surviving phrasing rather than the retired copy.
    expect(about).toMatch(
      /pairs twelve driving styles for\s+each hand into 144 combinations/
    );
    expect(about).not.toContain("prop rotations : hand cycles");
    // Same rewrite merged the standalone "What Austen Cloud built" section
    // into this one; the independent-work sentence itself is unchanged.
    expect(about).toContain("Austen built this app independently");
    expect(about).toContain("KINETIC_SHAPE_ENGINE_AUTHOR");
    expect(about).toMatch(/not an official\s+Spin Science release/);
    expect(menu).toContain("Lorq Nichols’ original 144 Shape Matrix");
  });

  it("uses the Shape Engine name at entry points without renaming Lorq's work", () => {
    const header = read("src/lib/shared/landing/components/SiteHeader.svelte");
    const catalog = read("src/lib/shared/notation/notation-catalog.ts");

    expect(header).toContain('label: "Shape Engine"');
    expect(catalog).toContain('label: "Shape Engine"');
    expect(catalog).toContain('name: "144 Shape Matrix"');
  });
});
