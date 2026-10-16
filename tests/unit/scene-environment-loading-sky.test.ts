/**
 * The 3D loading screen paints each environment's sky before the scene
 * loads. Its colours are copies (the loading screen must not pull in the
 * scene bundles), so a retuned default sky would leave the loading screen
 * showing a different place than the one that fades in.
 */
import { describe, expect, it } from "vitest";
import { SCENE_ENVIRONMENTS } from "#lib/shared/3d/environments/domain/scene-environment.js";
import { SCENE_ENVIRONMENT_LOADING_SKY } from "#lib/shared/3d/environments/domain/scene-environment-loading-sky.js";
import { createDefaultAutumnConfig } from "#lib/shared/3d/environments/domain/models/scene-configs/autumn-scene-config.js";
import { createDefaultBlossomConfig } from "#lib/shared/3d/environments/domain/models/scene-configs/blossom-scene-config.js";
import { createDefaultCelestialConfig } from "#lib/shared/3d/environments/domain/models/scene-configs/celestial-scene-config.js";
import { createDefaultCosmicNightConfig } from "#lib/shared/3d/environments/domain/models/scene-configs/cosmic-scene-config.js";
import { createDefaultEmberConfig } from "#lib/shared/3d/environments/domain/models/scene-configs/ember-scene-config.js";
import { createDefaultForestFireflyConfig } from "#lib/shared/3d/environments/domain/models/scene-configs/forest-scene-config.js";
import { createDefaultRainbowConfig } from "#lib/shared/3d/environments/domain/models/scene-configs/rainbow-scene-config.js";
import { createDefaultWinterConfig } from "#lib/shared/3d/environments/domain/models/scene-configs/winter-scene-config.js";
import { OCEAN_BACKGROUND_COLOR } from "#lib/shared/3d/environments/worlds/ocean/ocean-scene-appearance.js";

describe("3D loading sky", () => {
  it("has a sky for every environment", () => {
    for (const environment of SCENE_ENVIRONMENTS) {
      expect(SCENE_ENVIRONMENT_LOADING_SKY[environment.id]).toBeDefined();
    }
  });

  it.each([
    ["cosmic", createDefaultCosmicNightConfig().sky],
    ["winter", createDefaultWinterConfig().sky],
    ["ember", createDefaultEmberConfig().sky],
    ["blossom", createDefaultBlossomConfig().sky],
    ["forest", createDefaultForestFireflyConfig().sky],
    ["autumn", createDefaultAutumnConfig().sky],
    ["celestial", createDefaultCelestialConfig().sky],
  ] as const)("matches the %s default sky", (id, sky) => {
    const loading = SCENE_ENVIRONMENT_LOADING_SKY[id];
    expect(loading.top.toLowerCase()).toBe(sky.topColor.toLowerCase());
    expect(loading.mid.toLowerCase()).toBe(sky.midColor?.toLowerCase());
    expect(loading.horizon.toLowerCase()).toBe(sky.bottomColor.toLowerCase());
  });

  it("matches the ocean and rainbow backgrounds", () => {
    expect(SCENE_ENVIRONMENT_LOADING_SKY.ocean.mid).toBe(
      OCEAN_BACKGROUND_COLOR
    );
    expect(SCENE_ENVIRONMENT_LOADING_SKY.rainbow.top).toBe(
      createDefaultRainbowConfig().fog.color
    );
  });
});
