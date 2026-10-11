import { describe, expect, it } from "vitest";
import { FIRE_PRESETS } from "#lib/shared/animation-engine/components/effects-panel/presets/fire-presets.js";

describe("Fire presets", () => {
  it("offers Liquid Fire as a complete look", () => {
    expect(FIRE_PRESETS.map((preset) => preset.name)).toEqual([
      "Classic",
      "Blue Flame",
      "Spirit",
      "Liquid Fire",
    ]);
    expect(
      FIRE_PRESETS.find((preset) => preset.id === "fire-liquid")?.patch
    ).toMatchObject({
      renderingStyle: "liquid",
      colorBlend: 0,
      propColors: null,
    });
  });

  it("returns every standard color preset to Natural Fire", () => {
    for (const preset of FIRE_PRESETS.filter(
      (candidate) => candidate.id !== "fire-liquid"
    )) {
      expect(preset.patch?.renderingStyle, preset.id).toBe("natural");
    }
  });
});
