import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createForestAtmosphereAnchor } from "#lib/shared/3d/environments/scenes/forest/forest-atmosphere-profile.js";

describe("Forest cloud sky", () => {
  it("adapts the canonical Celestial 2D cloud system", () => {
    const source = readFileSync(
      resolve(
        "src/lib/shared/3d/environments/primitives/CelestialCloudSky.svelte"
      ),
      "utf8"
    );

    expect(source).toContain("CelestialBackgroundSystem");
    expect(source).toContain("gradient: false");
    expect(source).toContain("clouds: true");
    expect(source).toContain("SphereGeometry");
    expect(source).toContain(
      "cloudMesh.position.copy(camera.current.position)"
    );
    expect(source).toContain("width: 2048, height: 1024");
    expect(source).toContain("seamBlend");
    expect(source).toContain("textureFrameInterval = 1 / 15");
    expect(source).not.toContain("gl_Position = vec4(position.xy");
  });

  it("uses the visible Sun as the cloud-lighting direction", () => {
    for (const id of ["dawn", "day", "goldenHour", "dusk"] as const) {
      const config = createForestAtmosphereAnchor(id).config;

      expect(config.clouds?.enabled).toBe(true);
      expect(config.clouds?.sunDirection).toEqual(config.sun?.direction);
      expect(config.clouds?.offset).toHaveLength(2);
      expect(config.clouds?.visualSource).toBe("celestial-2d");
    }
  });

  it("keeps the approved Night Master cloud-free", () => {
    expect(createForestAtmosphereAnchor("night").config.clouds).toBeUndefined();
  });

  it("returns fresh cloud configs for each review anchor", () => {
    const firstDay = createForestAtmosphereAnchor("day").config;
    const secondDay = createForestAtmosphereAnchor("day").config;
    const expectedCoverage = firstDay.clouds!.coverage;
    const expectedOffset = [...firstDay.clouds!.offset!] as [number, number];

    firstDay.clouds!.coverage = 0;
    firstDay.clouds!.offset![0] = 999;

    expect(secondDay.clouds?.coverage).toBe(expectedCoverage);
    expect(secondDay.clouds?.offset).toEqual(expectedOffset);
  });
});
