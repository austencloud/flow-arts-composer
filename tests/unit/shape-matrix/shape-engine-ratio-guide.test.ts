import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  flowerPetals,
  ratioLabel,
} from "#lib/shared/shape-matrix/domain/flower-signature.js";
import { matrixFiltersForSize } from "#lib/shared/shape-matrix/domain/matrix-size-preset.js";
import { applyFilter } from "#lib/shared/shape-matrix/domain/filter-flower-axis.js";
import { buildShapeMatrixAxis } from "#lib/shared/shape-matrix/domain/flower-signature.js";

function read(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

const PAGE_PATH = "src/routes/(public)/guide/ratios/+page.svelte";

describe("Shape Engine ratio guide", () => {
  it("names the three original families from the shared ratio labels", () => {
    // The guide prints these through ratioLabel rather than storing its own
    // copies, so the mapping cannot drift away from the engine.
    expect(ratioLabel(0)).toBe("1:1");
    expect(ratioLabel(1)).toBe("1:3");
    expect(ratioLabel(2)).toBe("1:5");
    expect(ratioLabel("fl")).toBe("1:0");
  });

  it("states the petal rule the page prints for the worked example", () => {
    expect(flowerPetals({ style: "pro", turns: 1 })).toBe(2);
    expect(flowerPetals({ style: "anti", turns: 1 })).toBe(4);
  });

  it("keeps the original band at twelve flowers per axis", () => {
    const axis = applyFilter(
      buildShapeMatrixAxis(),
      matrixFiltersForSize("large").left,
      false
    );
    expect(axis).toHaveLength(12);
    expect(axis.length * axis.length).toBe(144);
  });

  it("derives its ratios and turn ladder from the engine's own domain", () => {
    const page = read(PAGE_PATH);

    expect(page).toContain("ratioLabel");
    expect(page).toContain("flowerPetals");
    expect(page).toContain("matrixTurnsForLevel");
    expect(page).toContain('matrixFiltersForSize("large")');
    // Real rendered flowers, not a written list of style names.
    expect(page).toContain("ShapeMatrixMandalaArt");
    expect(page).toContain("ShapeMatrixGrid");
    expect(page).toContain("headerArtworkSrc");
  });

  it("avoids retired ratio copy and reversed reading orders", () => {
    const page = read(PAGE_PATH);

    expect(page).not.toContain("prop rotations : hand cycles");
    expect(page).not.toContain("One family, two reading orders");
    // Ratio labels stay hands first everywhere a reader can see them.
    expect(page).not.toContain("3:1");
    expect(page).not.toContain("5:1");
  });

  it("connects the guide, Shape Engine, and both relevant history records", () => {
    const page = read(PAGE_PATH);
    const about = read(
      "src/lib/shared/shape-matrix/app/components/ShapeMatrixAboutModal.svelte"
    );
    const sidebar = read(
      "src/routes/(public)/guide/_components/GuideSidebar.svelte"
    );
    const sitemap = read("src/routes/sitemap.xml/+server.ts");

    expect(page).toContain('path="/guide/ratios"');
    expect(page).toContain("/history#archive-record-vtg");
    expect(page).toContain("/history#archive-record-lorq");
    expect(page).toContain("/shape-engine?");
    expect(about).toContain('size="xl"');
    expect(about).toContain('href="/guide/ratios"');
    expect(about).toContain("/history#archive-record-vtg");
    expect(about).toContain("/history#archive-record-lorq");
    expect(sidebar).toContain('href="/guide/ratios"');
    expect(sitemap).toContain('{ url: "guide/ratios" }');
  });
});
