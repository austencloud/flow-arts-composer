import { describe, expect, it } from "vitest";
import { createDefaultForestFireflyConfig } from "#lib/shared/3d/environments/domain/models/scene-configs/forest-scene-config.js";
import {
  FOREST_ATMOSPHERE_ANCHOR_IDS,
  createForestAtmosphereAnchor,
  createForestAtmosphereAnchors,
  isForestAtmosphereAnchorId,
} from "#lib/shared/3d/environments/scenes/forest/forest-atmosphere-profile.js";

describe("Forest registered atmosphere anchors", () => {
  it("keeps the five anchors in chronological review order", () => {
    const anchors = createForestAtmosphereAnchors();

    expect(anchors.map((anchor) => anchor.id)).toEqual([
      "dawn",
      "day",
      "goldenHour",
      "dusk",
      "night",
    ]);
    expect(anchors.map((anchor) => anchor.hour)).toEqual([
      5.75, 12.5, 18.25, 20.25, 23,
    ]);
  });

  it("preserves revision 36 as the exact Night Master config", () => {
    expect(createForestAtmosphereAnchor("night").config).toEqual(
      createDefaultForestFireflyConfig()
    );
  });

  it("uses one motivated celestial direction for each daylight key", () => {
    for (const id of ["dawn", "day", "goldenHour", "dusk"] as const) {
      const config = createForestAtmosphereAnchor(id).config;

      expect(config.sun?.enabled).toBe(true);
      expect(config.sun?.direction).toEqual(config.lighting?.key.direction);
      expect(config.moon).toBeNull();
      expect(config.starfield).toBeNull();
      expect(config.shootingStars).toBeNull();
    }
  });

  it("keeps nocturnal life out of full daylight", () => {
    const day = createForestAtmosphereAnchor("day").config;
    const dusk = createForestAtmosphereAnchor("dusk").config;
    const night = createForestAtmosphereAnchor("night").config;

    expect(day.fireflies).toBeNull();
    expect(day.canopyFlight).toBe("none");
    expect(day.campfire?.primaryLight.intensity).toBe(0);
    expect(dusk.fireflies?.count).toBeGreaterThan(0);
    expect(dusk.canopyFlight).toBe("bats");
    expect(night.fireflies?.count).toBeGreaterThan(dusk.fireflies?.count ?? 0);
  });

  it("keeps Day's shared tree and ground-life atlases neutral for wood", () => {
    const materials =
      createForestAtmosphereAnchor("day").config.materialResponse;

    expect(materials?.foliageTint).toBe("#ffffff");
    expect(materials?.groundLifeTint).toBe("#ffffff");
    expect(materials?.foliageHighlightStrength).toBeLessThanOrEqual(0.8);
  });

  it("keeps Day key-led so leaf cards retain directional depth", () => {
    const day = createForestAtmosphereAnchor("day").config;
    const lighting = day.lighting!;

    expect(lighting.key.intensity).toBeGreaterThanOrEqual(2);
    expect(lighting.fill.intensity).toBe(0.32);
    expect(lighting.ambient.intensity).toBe(0.11);
    expect(
      lighting.fill.intensity / lighting.key.intensity
    ).toBeLessThanOrEqual(0.14);
    expect(
      lighting.ambient.intensity / lighting.key.intensity
    ).toBeLessThanOrEqual(0.046);
    expect(day.hemisphereLight.intensity).toBe(1);
    expect(day.fog.density).toBeLessThanOrEqual(0.006);
  });

  it("returns fresh configs so review changes cannot mutate another anchor", () => {
    const firstDay = createForestAtmosphereAnchor("day").config;
    const secondDay = createForestAtmosphereAnchor("day").config;
    const expectedTopColor = firstDay.sky.topColor;
    const expectedKeyIntensity = firstDay.lighting!.key.intensity;

    firstDay.sky.topColor = "#000000";
    firstDay.lighting!.key.intensity = 999;

    expect(secondDay.sky.topColor).toBe(expectedTopColor);
    expect(secondDay.lighting?.key.intensity).toBe(expectedKeyIntensity);
  });

  it("accepts only registered query-string anchor ids", () => {
    for (const id of FOREST_ATMOSPHERE_ANCHOR_IDS) {
      expect(isForestAtmosphereAnchorId(id)).toBe(true);
    }
    expect(isForestAtmosphereAnchorId("midnight-blue")).toBe(false);
    expect(isForestAtmosphereAnchorId(null)).toBe(false);
  });
});
