import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  CLOUDBREAK_ASSET_HUNT,
  CLOUDBREAK_ASSET_CATALOG,
  CLOUDBREAK_CATALOG_VIEWS,
  assetsForView,
} from "../../../src/routes/test/celestial-asset-catalog/catalog";
import cloudbreakLayout from "../../../scripts/seraphic-vault-cloudbreak-layout.json";

describe("Olive Cloudbreak reusable asset catalog", () => {
  it("records provenance, rights, weight, and immutable source identity", () => {
    expect(CLOUDBREAK_ASSET_CATALOG).toHaveLength(12);
    for (const asset of CLOUDBREAK_ASSET_CATALOG) {
      expect(asset.path).toMatch(/^\/models\/.+\.glb$/);
      expect(asset.source.length).toBeGreaterThan(0);
      expect(asset.license.length).toBeGreaterThan(0);
      expect(asset.sizeBytes).toBeGreaterThan(0);
      expect(asset.renderVertexCount).toBeGreaterThan(0);
      expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("keeps foreground reuse conservative", () => {
    const foreground = assetsForView("front");
    expect(foreground.map((asset) => asset.id)).toEqual([
      "olive-west-ancient",
      "olive-east-windswept",
      "coast-rocks-05",
      "sand-rocks-small-01",
      "polyhaven-boulder",
      "polyhaven-rock",
    ]);
    expect(
      foreground.every(
        (asset) => asset.verdict === "reuse" || asset.verdict === "adapt"
      )
    ).toBe(true);
  });

  it("keeps stylized and inefficient models out of the registered front", () => {
    const cohesionIds = new Set(assetsForView("front").map(({ id }) => id));
    expect(cohesionIds.has("low-poly-oak")).toBe(false);
    expect(cohesionIds.has("low-poly-rock")).toBe(false);
    expect(cohesionIds.has("polyhaven-stone")).toBe(false);
  });

  it("keeps the spatial amendment measurable and separate from asset auditions", () => {
    expect(CLOUDBREAK_CATALOG_VIEWS.map(({ value }) => value)).toEqual([
      "front",
      "rear",
      "plan",
      "trees",
      "stone",
    ]);
    expect(assetsForView("rear")).toEqual([]);
    expect(assetsForView("plan")).toEqual([]);
    expect(cloudbreakLayout.revision).toBe("olive-cloudbreak-r6");
    expect(cloudbreakLayout.approach.wornBandWidth).toBeGreaterThanOrEqual(5);
    expect(cloudbreakLayout.rearThreshold.outerHeight).toBeGreaterThanOrEqual(
      10 * 1.75
    );
    expect(cloudbreakLayout.rearThreshold.openingWidth).toBeGreaterThan(
      cloudbreakLayout.approach.wornBandWidth
    );
  });

  it("keeps the reflective surface on the authored lagoon outline", () => {
    const sceneSource = readFileSync(
      "src/routes/test/celestial-asset-catalog/CloudbreakAssetCatalogScene.svelte",
      "utf8"
    );
    const cloudbreakSource = readFileSync(
      "src/lib/shared/3d/environments/scenes/celestial/OliveCloudbreakSlice.svelte",
      "utf8"
    );
    const reflectorSource = readFileSync(
      "src/lib/shared/3d/environments/primitives/PlanarReflector.svelte",
      "utf8"
    );
    const poolShaderSource = readFileSync(
      "src/lib/shared/3d/environments/primitives/reflective-pool-shader.ts",
      "utf8"
    );

    expect(sceneSource).toContain("<OliveCloudbreakSlice");
    expect(cloudbreakSource).toContain(
      "outline={CLOUDBREAK_LAGOON_LOCAL_OUTLINE}"
    );
    expect(cloudbreakSource).toContain('role === "cloudbreak-lagoon-rim"');
    expect(sceneSource).toContain("<CelestialCloudPanorama />");
    expect(reflectorSource).toContain("new ShapeGeometry(shape)");
    expect(cloudbreakLayout.lagoon.outlineXZ.length).toBeGreaterThan(10);
    expect(poolShaderSource).toContain("shorelineDistance( metres )");
    expect(poolShaderSource).toContain("uShorelineStarts[32]");
  });

  it("keeps the root-mounted lagoon aligned with and isolated to Celestial", () => {
    const environmentSource = readFileSync(
      "src/lib/shared/3d/environments/components/Environment3D.svelte",
      "utf8"
    );
    const celestialSource = readFileSync(
      "src/lib/shared/3d/environments/scenes/CelestialScene.svelte",
      "utf8"
    );
    const cloudbreakSource = readFileSync(
      "src/lib/shared/3d/environments/scenes/celestial/OliveCloudbreakSlice.svelte",
      "utf8"
    );

    expect(environmentSource).toContain(
      "worldYOffset={frame.environmentYOffset}"
    );
    expect(environmentSource).toContain("worldYOffset={environmentYOffset}");
    expect(celestialSource).toMatch(
      /createLoadedCelestialEnvironmentWorld\(\{[^}]*\bworldYOffset,/
    );
    expect(celestialSource).toContain("current.setActive(active)");
    expect(cloudbreakSource).toMatch(
      /groundY \+ worldYOffset \+ CLOUDBREAK_LAYOUT\.lagoon\.surfaceY \+ 0\.035/
    );
    expect(cloudbreakSource).toContain(
      'active={active && view !== "plan"}'
    );
  });

  it("reviews the Cloudbreak slice while the runtime builds the shared world", () => {
    const reviewSource = readFileSync(
      "src/routes/test/celestial-asset-catalog/CloudbreakAssetCatalogScene.svelte",
      "utf8"
    );
    const runtimeSource = readFileSync(
      "src/lib/shared/3d/environments/worlds/celestial/celestial-environment-world.ts",
      "utf8"
    );

    expect(reviewSource).toContain("<OliveCloudbreakSlice");
    expect(runtimeSource).toContain(
      "const cloudbreak = createCelestialCloudbreakWorld("
    );
    expect(reviewSource).not.toMatch(
      /\.\/Cloudbreak(?:LagoonEdge|SpatialStudy|Waterfall)/
    );
  });

  it("limits Meshy spending to the custom organic signatures", () => {
    const meshyTargets = CLOUDBREAK_ASSET_HUNT.filter(({ method }) =>
      method.startsWith("Meshy")
    );
    expect(meshyTargets.map(({ id }) => id)).toEqual([
      "ancient-olive-west",
      "windswept-olive-east",
    ]);
    expect(
      CLOUDBREAK_ASSET_HUNT.filter(
        ({ method }) => method === "CC0 catalog"
      ).map(({ id }) => id)
    ).toEqual(["lagoon-limestone-outcrop", "eroded-shelf-family"]);
    expect(
      CLOUDBREAK_ASSET_HUNT.find(({ id }) => id === "monumental-threshold")
        ?.method
    ).toBe("Blender modular");
    expect(
      CLOUDBREAK_ASSET_HUNT.filter(
        ({ method }) => method === "Runtime owner"
      ).map(({ id }) => id)
    ).toEqual(["lagoon-optics", "infinite-sun"]);
  });
});
