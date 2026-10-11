import { describe, expect, it } from "vitest";

import {
  DEFAULT_EMBER_ATMOSPHERE_LOOK,
  EMBER_ATMOSPHERE_LOOK_IDS,
  createDefaultEmberConfig,
} from "#lib/shared/3d/environments/domain/models/scene-configs.js";

describe("Ember cinematic atmosphere looks", () => {
  it("ships the selected Blackglass Inferno look as the production default", () => {
    expect(DEFAULT_EMBER_ATMOSPHERE_LOOK).toBe("blackglass-inferno");
    expect(createDefaultEmberConfig().atmosphere.id).toBe("blackglass-inferno");
  });

  it.each(EMBER_ATMOSPHERE_LOOK_IDS)(
    "keeps %s camera-auditionable without changing the volcanic chassis",
    (lookId) => {
      const baseline = createDefaultEmberConfig();
      const candidate = createDefaultEmberConfig(lookId);

      expect(candidate.atmosphere.id).toBe(lookId);
      expect(candidate.lavaRivers?.channels).toEqual(
        baseline.lavaRivers?.channels
      );
      expect(candidate.atmosphere.directionals.length).toBeGreaterThanOrEqual(
        4
      );
      expect(candidate.atmosphere.points.length).toBeGreaterThanOrEqual(4);
      expect(candidate.atmosphere.plumes.length).toBeGreaterThanOrEqual(3);
      expect(candidate.atmosphere.heatFields.length).toBeGreaterThanOrEqual(3);
      expect(candidate.fog.density).toBeLessThanOrEqual(0.012);
      expect(candidate.hemisphereLight.intensity).toBeGreaterThanOrEqual(1);
      expect(candidate.skyLight?.intensity).toBeGreaterThanOrEqual(1.5);

      const plumeParticles = candidate.atmosphere.plumes.reduce(
        (count, plume) => count + plume.count,
        0
      );
      const localParticles =
        candidate.embers.count +
        (candidate.ash?.count ?? 0) +
        (candidate.smoke?.count ?? 0);
      expect(plumeParticles + localParticles).toBeLessThanOrEqual(430);
    }
  );

  it("keeps the three art directions materially distinct", () => {
    const looks = EMBER_ATMOSPHERE_LOOK_IDS.map((id) =>
      createDefaultEmberConfig(id)
    );

    expect(new Set(looks.map((look) => look.sky.midColor)).size).toBe(3);
    expect(new Set(looks.map((look) => look.fog.color)).size).toBe(3);
    expect(new Set(looks.map((look) => look.volcanicHaze?.color1)).size).toBe(
      3
    );
  });
});
