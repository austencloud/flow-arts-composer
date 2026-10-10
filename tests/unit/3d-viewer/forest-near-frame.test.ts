import { describe, expect, it } from "vitest";
import {
  createDefaultForestFireflyConfig,
  shouldShowForestNearFrame,
} from "#lib/shared/3d/environments/domain/models/scene-configs/forest-scene-config.js";
import { QualityTier } from "#lib/shared/3d/effects/types.js";
import {
  getForestGrassTierFromName,
  isForestGrassTierVisible,
} from "#lib/shared/3d/environments/scenes/forest/forest-grass-tier.js";

describe("Forest close-frame visibility", () => {
  it("shows the production composition in Scene Lab and omits it for widened callers", () => {
    expect(shouldShowForestNearFrame(undefined)).toBe(true);
    expect(shouldShowForestNearFrame(14)).toBe(false);
    expect(shouldShowForestNearFrame(28)).toBe(false);
    expect(createDefaultForestFireflyConfig()).not.toHaveProperty("treeRings");
  });

  it("reveals the summer meadow tiers cumulatively", () => {
    expect(
      isForestGrassTierVisible("Forest_Grass_Base_Lush", QualityTier.LOW)
    ).toBe(true);
    expect(
      isForestGrassTierVisible("Forest_Grass_Medium_Base", QualityTier.LOW)
    ).toBe(false);
    expect(
      isForestGrassTierVisible("Forest_Grass_Medium_Shade", QualityTier.MEDIUM)
    ).toBe(true);
    expect(
      isForestGrassTierVisible("Forest_Grass_High_Lush", QualityTier.HIGH)
    ).toBe(true);
    expect(
      isForestGrassTierVisible(
        "Forest Clearing Grass Base Lush Prototype 2 Mesh",
        QualityTier.LOW
      )
    ).toBe(true);
    expect(
      isForestGrassTierVisible(
        "Forest Clearing Grass High Shade Prototype 3 Mesh",
        QualityTier.MEDIUM
      )
    ).toBe(false);
    expect(
      getForestGrassTierFromName("ForestNearFrameMushroom_Cap")
    ).toBeNull();
  });

  it("keeps scanned ecosystem guilds behind the same cumulative quality owner", () => {
    expect(
      isForestGrassTierVisible(
        "Forest_Ecosystem_Base_summer-sward_01_0001",
        QualityTier.LOW
      )
    ).toBe(true);
    expect(
      isForestGrassTierVisible(
        "Forest_Ecosystem_Medium_bracken-fern_02_0012",
        QualityTier.LOW
      )
    ).toBe(false);
    expect(
      isForestGrassTierVisible(
        "Forest_Ecosystem_High_periwinkle-patch_04_0003",
        QualityTier.HIGH
      )
    ).toBe(true);
  });
});
