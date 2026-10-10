import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FOREST_ENVIRONMENT_ASSET_URLS } from "#lib/shared/3d/environments/worlds/forest/forest-environment-world.js";
import {
  createForestPrototypeWorld,
  FOREST_PROTOTYPE_CAMERA,
} from "#lib/shared/3d/worker-renderer/worlds/forest-prototype-world.js";

const sceneSource = readFileSync(
  resolve("src/lib/shared/3d/environments/scenes/ForestScene.svelte"),
  "utf8"
);
const productionSource = readFileSync(
  resolve(
    "src/lib/shared/3d/environments/scenes/forest/ForestProductionScene.svelte"
  ),
  "utf8"
);
const workerSource = readFileSync(
  resolve("src/lib/shared/3d/worker-renderer/worlds/forest-prototype-world.ts"),
  "utf8"
);

describe("Forest shared renderer adapter contract", () => {
  it("routes production Svelte and worker rendering through one world owner", () => {
    expect(sceneSource).toContain("ForestProductionScene");
    expect(productionSource).toContain("createForestEnvironmentWorld");
    expect(workerSource).toContain("createForestEnvironmentWorld");
    expect(productionSource).toContain("FOREST_ENVIRONMENT_ASSET_URLS");
    expect(workerSource).toContain("FOREST_ENVIRONMENT_ASSET_URLS");
  });

  it("pins the complete authored production asset contract", () => {
    expect(FOREST_ENVIRONMENT_ASSET_URLS).toEqual({
      environment: "/models/forest/forest-environment.glb",
      nearFrame: "/models/forest/forest-near-frame.glb",
      campsite: "/models/forest/forest-campsite.glb",
      stage: "/models/forest/forest-stage.glb",
      moon: "/textures/moon.png",
    });
  });

  it("exports an independently constructible worker adapter and camera", () => {
    expect(createForestPrototypeWorld).toBeTypeOf("function");
    expect(FOREST_PROTOTYPE_CAMERA).toEqual({
      position: [0, 4.6, 19],
      target: [0, 1.3, -1.5],
      fov: 46,
    });
  });
});
