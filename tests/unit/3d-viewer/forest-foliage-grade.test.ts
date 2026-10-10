import { describe, expect, it } from "vitest";
import {
  applyForestFoliageGrade,
  calculateForestCanopyLodAlphaCoverage,
  calculateForestCanopyLodVisibility,
  calculateForestFoliageSkyExposure,
  resolveForestFoliageAlphaTreatment,
  resolveForestFoliageGradeCoverage,
  resolveForestFoliageGreenSignalFloor,
  resolveForestFoliageGradeWeight,
  resolveForestFoliageIndirectDepth,
  resolveForestFoliageLuminanceScale,
  resolveForestIndirectLightRetention,
} from "#lib/shared/3d/environments/scenes/forest/forest-foliage-grade.js";

const luminance = (color: { r: number; g: number; b: number }): number =>
  color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;

describe("Forest foliage family grading", () => {
  it.each([
    "jacaranda_tree_leaves.001",
    "island_tree_01_leaves",
    "tree_small_02_leaves",
    "fir_tree_01_twig",
    "fir_sapling_medium_leaf",
  ])("preserves distant photographic coverage for %s", (materialName) => {
    expect(resolveForestFoliageAlphaTreatment(materialName, 0.35)).toEqual({
      alphaHash: true,
      alphaTest: 0,
    });
  });

  it("keeps opaque semantic foliage on its authored material path", () => {
    expect(resolveForestFoliageAlphaTreatment("Foliage", 0)).toEqual({
      alphaHash: false,
      alphaTest: 0,
    });
  });

  it("alpha-hashes the semantic distance canopy so its fade is real coverage", () => {
    expect(
      resolveForestFoliageAlphaTreatment(
        "ForestSemanticCanopy_semantic-beech_foliage_canopy_lod",
        0
      )
    ).toEqual({ alphaHash: true, alphaTest: 0 });
  });

  it("crossfades canopy support only at environment distance", () => {
    expect(calculateForestCanopyLodVisibility(20)).toBe(0);
    expect(calculateForestCanopyLodVisibility(45)).toBeCloseTo(0.5, 5);
    expect(calculateForestCanopyLodVisibility(80)).toBe(1);
  });

  it("boosts averaged mip coverage without changing binary cutouts", () => {
    expect(calculateForestCanopyLodAlphaCoverage(0)).toBe(0);
    expect(calculateForestCanopyLodAlphaCoverage(1)).toBe(1);
    expect(calculateForestCanopyLodAlphaCoverage(0.26)).toBeGreaterThan(0.8);
  });

  it("corrects the silver-green Jacaranda family more strongly", () => {
    expect(resolveForestFoliageGradeCoverage("jacaranda_tree_leaves.002")).toBe(
      1.28
    );
  });

  it("keeps naturally green foliage close to its authored atlas", () => {
    expect(resolveForestFoliageGradeCoverage("island_tree_01_leaves.001")).toBe(
      0.82
    );
    expect(resolveForestFoliageGradeCoverage("Material_Foliage")).toBe(0.82);
  });

  it.each([
    ["Cathedral European Beech R2_Foliage", 0.76],
    ["Fluted European Hornbeam R2_Foliage", 0.63],
    ["Airy Silver Birch_Foliage", 0.72],
    ["Tall Tulip Tree R5_Foliage", 0.82],
    ["Shagbark Hickory_Foliage", 0.42],
    ["Mottled American Sycamore R2_Foliage", 0.67],
  ])("normalizes semantic summer exposure for %s", (materialName, scale) => {
    expect(resolveForestFoliageGradeCoverage(materialName)).toBe(1);
    expect(resolveForestFoliageGreenSignalFloor(materialName)).toBe(1);
    expect(resolveForestFoliageLuminanceScale(materialName)).toBe(scale);
  });

  it("leaves neutral pixels in the naturally green families outside the grade", () => {
    expect(
      resolveForestFoliageGradeWeight("island_tree_01_leaves", 0.78, 0)
    ).toBe(0);

    const neutral = { r: 0.2, g: 0.2, b: 0.2 };
    expect(
      applyForestFoliageGrade(
        neutral,
        { r: 0.1, g: 0.3, b: 0.08 },
        "island_tree_01_leaves",
        0.78
      )
    ).toEqual(neutral);
  });

  it("pulls silver Jacaranda leaf texels into the summer palette", () => {
    const neutralLeaf = { r: 0.42, g: 0.43, b: 0.4 };
    const graded = applyForestFoliageGrade(
      neutralLeaf,
      { r: 0.1, g: 0.3, b: 0.08 },
      "jacaranda_tree_leaves",
      0.78
    );

    expect(resolveForestFoliageGreenSignalFloor("jacaranda_tree_leaves")).toBe(
      1
    );
    expect(graded.g).toBeGreaterThan(graded.r * 2);
    expect(luminance(graded)).toBeLessThan(luminance(neutralLeaf) * 0.75);
  });

  it("darkens Jacaranda foliage multiplicatively without flattening contrast", () => {
    const source = { r: 0.05, g: 0.2, b: 0.04 };
    const sourceHighlight = { r: 0.1, g: 0.4, b: 0.08 };
    const graded = applyForestFoliageGrade(
      source,
      { r: 0.1, g: 0.3, b: 0.08 },
      "jacaranda_tree_leaves",
      0.78
    );
    const gradedHighlight = applyForestFoliageGrade(
      sourceHighlight,
      { r: 0.1, g: 0.3, b: 0.08 },
      "jacaranda_tree_leaves",
      0.78
    );

    expect(graded).not.toEqual(source);
    expect(resolveForestFoliageLuminanceScale("jacaranda_tree_leaves")).toBe(
      0.58
    );
    expect(luminance(graded)).toBeCloseTo(luminance(source) * 0.58, 3);
    expect(luminance(gradedHighlight) / luminance(graded)).toBeCloseTo(
      luminance(sourceHighlight) / luminance(source),
      3
    );
  });

  it("preserves authored luminance for the other natural foliage families", () => {
    const source = { r: 0.05, g: 0.2, b: 0.04 };
    const graded = applyForestFoliageGrade(
      source,
      { r: 0.1, g: 0.3, b: 0.08 },
      "island_tree_01_leaves",
      0.78
    );

    expect(resolveForestFoliageLuminanceScale("island_tree_01_leaves")).toBe(1);
    expect(luminance(graded)).toBeCloseTo(luminance(source), 12);
  });

  it("brings bright semantic hickory into the photographic canopy range", () => {
    const source = { r: 0.12, g: 0.34, b: 0.08 };
    const graded = applyForestFoliageGrade(
      source,
      { r: 0.1, g: 0.3, b: 0.08 },
      "Shagbark Hickory_Foliage",
      0.78
    );

    expect(luminance(graded)).toBeLessThan(luminance(source) * 0.6);
    expect(graded.g).toBeGreaterThan(graded.r * 2);
  });

  it("limits indirect-depth shaping to the near-frame canopy", () => {
    expect(resolveForestFoliageIndirectDepth("near-frame")).toBe(0.24);
    expect(resolveForestFoliageIndirectDepth("environment")).toBe(0);
    expect(resolveForestFoliageIndirectDepth("stage")).toBe(0);
    expect(resolveForestFoliageIndirectDepth("camp")).toBe(0);
  });

  it("keeps open leaf faces bright while adding depth beneath the canopy", () => {
    const downwardExposure = calculateForestFoliageSkyExposure(-1);
    const horizontalExposure = calculateForestFoliageSkyExposure(0);
    const upwardExposure = calculateForestFoliageSkyExposure(1);

    expect(
      resolveForestIndirectLightRetention(0.24, downwardExposure)
    ).toBeCloseTo(0.76, 6);
    expect(
      resolveForestIndirectLightRetention(0.24, horizontalExposure)
    ).toBeCloseTo(0.817, 3);
    expect(resolveForestIndirectLightRetention(0.24, upwardExposure)).toBe(1);
  });
});
