import { describe, expect, it } from "vitest";
import { createDefaultForestFireflyConfig } from "#lib/shared/3d/environments/domain/models/scene-configs/forest-scene-config.js";

describe("Forest moonlit lighting defaults", () => {
  it("uses cool global bounce instead of campfire-colored ambient light", () => {
    const config = createDefaultForestFireflyConfig();

    expect(config.hemisphereLight.skyColor).toBe("#809eb7");
    expect(config.hemisphereLight.groundColor).toBe("#162d24");
    expect(config.hemisphereLight.intensity).toBeLessThan(0.5);
  });

  it("keeps the warm practical light local to the campsite", () => {
    const campfire = createDefaultForestFireflyConfig().campfire;

    expect(campfire).not.toBeNull();
    expect(campfire?.primaryLight.distance).toBeLessThanOrEqual(14);
    expect(campfire?.primaryLight.decay).toBe(2);
    expect(campfire?.fillLight.distance).toBeLessThanOrEqual(12);
    expect(campfire?.fillLight.decay).toBe(2);
  });

  it("keeps enough fog for depth without erasing the far tree line", () => {
    const fog = createDefaultForestFireflyConfig().fog;

    expect(fog.color).toBe("#0a171c");
    expect(fog.density).toBeGreaterThanOrEqual(0.02);
    expect(fog.density).toBeLessThanOrEqual(0.025);
  });
});
