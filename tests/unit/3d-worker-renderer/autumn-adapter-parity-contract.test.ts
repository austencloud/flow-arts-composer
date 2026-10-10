import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createAutumnPrototypeWorld } from "#lib/shared/3d/worker-renderer/worlds/autumn-prototype-world.js";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Autumn legacy and worker adapter parity", () => {
  const svelte = source(
    "src/lib/shared/3d/environments/scenes/AutumnScene.svelte"
  );
  const worker = source(
    "src/lib/shared/3d/worker-renderer/worlds/autumn-prototype-world.ts"
  );
  const world = source(
    "src/lib/shared/3d/environments/worlds/autumn/autumn-environment-world.ts"
  );
  const assets = source(
    "src/lib/shared/3d/environments/worlds/autumn/autumn-environment-assets.ts"
  );

  it("routes both renderers through the same assets and world owners", () => {
    expect(createAutumnPrototypeWorld).toBeTypeOf("function");
    for (const adapter of [svelte, worker]) {
      expect(adapter).toContain("loadAutumnEnvironmentAssets");
      expect(adapter).toContain("createAutumnEnvironmentWorld");
    }
    expect(svelte).not.toContain("AutumnRuntimeSystems");
    expect(svelte).not.toContain("<SkyGradient");
    expect(svelte).not.toContain("<Starfield");
    expect(worker).not.toContain("GLTFLoader");
    expect(worker).not.toContain("KTX2Loader");
    expect(worker).not.toContain("MeshoptDecoder");
  });

  it("keeps the exact authored decoder, request, and retry path in one place", () => {
    expect(assets).toContain("createAutumnEnvironmentTransport");
    expect(assets).toContain("startAutumnEnvironmentRequest");
    expect(assets).toContain("loader.setMeshoptDecoder(MeshoptDecoder)");
    expect(assets).toContain("loader.setKTX2Loader(ktx2)");
    expect(assets).toContain("/models/autumn/autumn-environment.glb");
    expect(assets).toContain(
      "/textures/autumn-floor/ground-detail-modulation.ktx2"
    );
  });

  it("assembles every production Autumn subsystem in the shared world", () => {
    for (const owner of [
      "createAutumnSky",
      "createAutumnStarfield",
      "createAutumnStage",
      "createAutumnLightingRig",
      "createAutumnMaterialRuntime",
      "createAutumnParticleLayers",
      "createAutumnWisps",
      "createAutumnMagicHabitats",
      "createAutumnPond",
      "createAutumnInteraction",
    ]) {
      expect(world, owner).toContain(owner);
    }
    expect(worker).toContain("useViewerBaseLighting: false");
    expect(worker).toContain('environment: "autumn"');
  });
});
