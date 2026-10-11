import { describe, expect, it, vi } from "vitest";
import {
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Texture,
} from "three";

import {
  createAutumnEnvironmentWorld,
  attachAutumnEnvironmentWorld,
} from "#lib/shared/3d/environments/worlds/autumn/autumn-environment-world.js";
import { disposeAutumnEnvironmentAssets } from "#lib/shared/3d/environments/worlds/autumn/autumn-environment-assets.js";

function authoredEnvironment(): Group {
  const root = new Group();
  const terrainMaterial = new MeshStandardMaterial();
  terrainMaterial.name = "Autumn Living Forest Floor";
  const terrain = new Mesh(new PlaneGeometry(120, 120), terrainMaterial);
  terrain.name = "Autumn_Terrain";
  terrain.rotation.x = -Math.PI / 2;
  root.add(terrain);

  for (const name of [
    "Autumn_Grass_Base",
    "Autumn_Grass_Medium",
    "Autumn_Grass_High",
  ]) {
    const material = new MeshStandardMaterial();
    material.name = `${name} material`;
    const grass = new Mesh(new PlaneGeometry(1, 1), material);
    grass.name = name;
    root.add(grass);
  }

  const lanternMaterial = new MeshStandardMaterial({
    emissive: new Color("#ff8a3d"),
    emissiveIntensity: 2,
  });
  const lantern = new Mesh(new PlaneGeometry(1, 1), lanternMaterial);
  lantern.name = "Autumn_Wayfinding_Lantern_Glow_Test";
  root.add(lantern);
  return root;
}

function assets() {
  return {
    environment: authoredEnvironment(),
    groundDetailMap: new Texture(),
    moonTexture: new Texture(),
  };
}

describe("Autumn exact shared environment world", () => {
  it("builds the complete production graph and global atmosphere", () => {
    const loaded = assets();
    const world = createAutumnEnvironmentWorld(
      { tier: "medium", groundY: -1.5, random: () => 0.5 },
      loaded
    );

    expect(world.root.name).toBe("autumn-environment-world");
    for (const name of [
      "autumn-sky-gradient",
      "autumn-starfield",
      "autumn-stage",
      "autumn-lighting",
      "autumn-particle-layers",
      "autumn-wisps",
      "autumn-magic-habitats",
      "autumn-pond",
    ]) {
      expect(world.root.getObjectByName(name), name).toBeTruthy();
    }
    expect(world.fog.isFogExp2).toBe(true);
    expect(world.fog.color.getHexString()).toBe("3b2948");
    expect(world.fog.density).toBe(0.011);
    expect(world.background.getHexString()).toBe("120b2b");
    expect(
      world.root.getObjectByName("autumn-lighting")?.children
    ).toHaveLength(7);
    expect(world.root.getObjectByName("autumn-wisps")?.children).toHaveLength(
      4
    );

    world.dispose();
    disposeAutumnEnvironmentAssets(loaded);
  });

  it("keeps geometry tiers, shadows, ground, motion, and interaction live", () => {
    const loaded = assets();
    const world = createAutumnEnvironmentWorld(
      {
        tier: "low",
        groundY: 0,
        performerPositions: [],
        random: () => 0.5,
      },
      loaded
    );
    const base = loaded.environment.getObjectByName("Autumn_Grass_Base")!;
    const medium = loaded.environment.getObjectByName("Autumn_Grass_Medium")!;
    const high = loaded.environment.getObjectByName("Autumn_Grass_High")!;
    expect([base.visible, medium.visible, high.visible]).toEqual([
      true,
      false,
      false,
    ]);

    world.setTier("high");
    expect([base.visible, medium.visible, high.visible]).toEqual([
      true,
      true,
      true,
    ]);
    const moon = world.root.getObjectByName("autumn-moon-key") as {
      castShadow: boolean;
    };
    expect(moon.castShadow).toBe(true);

    const wisp = world.root.getObjectByName("autumn-wisp-0")!;
    const core = world.root.getObjectByName("autumn-wisp-core-0") as Mesh<
      PlaneGeometry,
      MeshStandardMaterial
    >;
    const camera = new PerspectiveCamera();
    camera.position.set(0, 3, 14);
    world.setPerformers([{ x: wisp.position.x, z: wisp.position.z }]);
    const resting = core.material.emissiveIntensity;
    world.update(1 / 30, 1 / 30, camera);
    expect(core.material.emissiveIntensity).toBeGreaterThan(resting);

    world.setGroundY(-2);
    expect(loaded.environment.position.y).toBe(-2);
    expect(world.root.getObjectByName("autumn-stage")?.position.y).toBe(-2);
    world.setActive(false);
    expect(world.root.visible).toBe(false);
    expect(moon.castShadow).toBe(false);
    world.setActive(true);
    expect(moon.castShadow).toBe(true);

    world.dispose();
    disposeAutumnEnvironmentAssets(loaded);
  });

  it("attaches once and releases every authored asset exactly once", () => {
    const loaded = assets();
    const environmentGeometry = (
      loaded.environment.getObjectByName("Autumn_Terrain") as Mesh
    ).geometry;
    const geometryDispose = vi.spyOn(environmentGeometry, "dispose");
    const detailDispose = vi.spyOn(loaded.groundDetailMap!, "dispose");
    const moonDispose = vi.spyOn(loaded.moonTexture!, "dispose");
    const world = createAutumnEnvironmentWorld(
      { tier: "medium", groundY: 0, random: () => 0.5 },
      loaded
    );
    const scene = new Scene();
    const detach = attachAutumnEnvironmentWorld(scene, world);
    expect(world.root.parent).toBe(scene);
    detach();
    expect(world.root.parent).toBeNull();
    world.dispose();
    disposeAutumnEnvironmentAssets(loaded);

    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(detailDispose).toHaveBeenCalledOnce();
    expect(moonDispose).toHaveBeenCalledOnce();
  });
});
