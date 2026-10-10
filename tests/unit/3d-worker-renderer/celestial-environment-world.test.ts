import { describe, expect, it, vi } from "vitest";
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  ShaderMaterial,
} from "three";

import { createDefaultCelestialConfig } from "#lib/shared/3d/environments/domain/models/scene-configs.js";
import { CLOUDBREAK_LAYOUT } from "#lib/shared/3d/environments/scenes/celestial/cloudbreak-layout.js";
import {
  CELESTIAL_AUTHORED_RESOURCE_URLS,
  createCelestialEnvironmentWorld,
  type CelestialEnvironmentAssets,
} from "#lib/shared/3d/environments/worlds/celestial/celestial-environment-world.js";
import { CELESTIAL_AUTHORED_RESOURCE_COUNT } from "#lib/shared/3d/environments/worlds/celestial/celestial-cloudbreak-world.js";

function assets(): CelestialEnvironmentAssets {
  const shell = new Group();
  const ground = new Mesh(
    new BoxGeometry(40, 0.2, 50),
    new MeshStandardMaterial()
  );
  ground.userData.sunwardRole = "ground";
  const court = new Mesh(
    new BoxGeometry(12.16, 0.045, 12.16),
    new MeshStandardMaterial()
  );
  court.name = "authored-court";
  court.userData.sunwardRole = "court";
  court.position.set(0, 0.2025, -1);
  shell.add(ground, court);
  return { shell };
}

describe("Celestial renderer-neutral world", () => {
  it("loads the citadel without a photographic cloud dependency", () => {
    expect(CELESTIAL_AUTHORED_RESOURCE_COUNT).toBe(1);
    expect(CELESTIAL_AUTHORED_RESOURCE_URLS).toEqual([
      expect.stringContaining("sky-citadel.glb"),
    ]);
  });

  it("builds the complete production graph, stage, lighting, and globals", () => {
    const world = createCelestialEnvironmentWorld(
      {
        groundY: -1.5,
        worldYOffset: 1.275,
        stageRadius: 3,
        stageRadiusGrowth: 0,
      },
      assets()
    );
    const names: string[] = [];
    world.root.traverse((object) => names.push(object.name));

    expect(names).toContain("celestial-sky-gradient");
    expect(names).toContain("celestial-volume-clouds");
    expect(names).toContain("celestial-sun");
    expect(names).toContain("celestial-cloudbreak-world");
    expect(names).toContain("celestial-authored-citadel");
    expect(
      names.filter((name) => name === "cloudbreak-waterfall")
    ).toHaveLength(1);
    expect(names).toContain("celestial-lighting");
    expect(names).toContain("celestial-sun-light");
    expect(names).toContain("celestial-cold-fill");
    expect(world.fog.color.getHexString()).toBe("b7c9d7");
    expect(world.fog.density).toBe(0.002);
    expect(world.background.getHexString()).toBe("6797cf");
    expect(world.reflector.name).toBe("cloudbreak-reflective-lagoon");
    expect(world.reflector.position.y).toBeCloseTo(-0.05, 6);
    expect(world.reflector.rotation.x).toBeCloseTo(-Math.PI / 2, 6);

    world.dispose();
  });

  it("expands only the authored court while retaining its height and center", () => {
    const bundle = assets();
    const world = createCelestialEnvironmentWorld(
      { groundY: 0, stageRadius: 7, stageRadiusGrowth: 3.5 },
      bundle
    );
    const court = world.root.getObjectByName("authored-court")!;
    expect(court.scale.x).toBeCloseTo(9.58 / 6.08);
    expect(court.scale.z).toBeCloseTo(9.58 / 6.08);
    expect(court.scale.y).toBe(1);
    expect(court.position.toArray()).toEqual([0, 0.2025, -1]);
    expect(bundle.shell.children[1]!.scale.toArray()).toEqual([1, 1, 1]);
    world.setStageBounds(3, 0);
    expect(court.scale.toArray()).toEqual([1, 1, 1]);
    world.setStageBounds(7, 3.5);
    expect(court.scale.x).toBeCloseTo(9.58 / 6.08);
    world.dispose();
  });

  it("keeps volumetric clouds in world space while the distant sky follows the camera", () => {
    const world = createCelestialEnvironmentWorld(
      { groundY: -1.5, motionScale: 1 },
      assets()
    );
    const camera = new PerspectiveCamera();
    camera.position.set(3, 7, 11);
    const sky = world.root.getObjectByName("celestial-sky-gradient")!;
    const clouds = world.root.getObjectByName(
      "celestial-volume-clouds"
    ) as Mesh;
    const cloudPosition = clouds.position.clone();
    const cloudMaterial = clouds.material as ShaderMaterial;
    const sun = world.root.getObjectByName("celestial-sun")!;
    const halo = world.root.getObjectByName("celestial-sun-halo") as Mesh;
    const beforeOpacity = (halo as unknown as { material: { opacity: number } })
      .material.opacity;

    world.update(0.25, 0.25, camera);
    expect(sky.position.toArray()).toEqual([3, 7, 11]);
    expect(clouds.position.equals(cloudPosition)).toBe(true);
    expect(cloudMaterial.uniforms.uTime!.value).toBeCloseTo(0.25);
    camera.position.set(50, 20, -30);
    world.update(0.25, 0.5, camera);
    expect(clouds.position.equals(cloudPosition)).toBe(true);
    expect(cloudMaterial.uniforms.uTime!.value).toBeCloseTo(0.5);
    expect(sun.children[0]!.position.distanceTo(camera.position)).toBeCloseTo(
      145,
      5
    );
    world.pulse();
    world.update(0.01, 0.26, camera);
    const afterOpacity = (halo as unknown as { material: { opacity: number } })
      .material.opacity;
    expect(afterOpacity).toBeGreaterThan(beforeOpacity);
    world.dispose();
  });

  it("freezes clouds, lagoon, and waterfalls when reduced motion is requested", () => {
    const world = createCelestialEnvironmentWorld(
      { groundY: 0, motionScale: 0 },
      assets()
    );
    const water = world.reflector.material as import("three").ShaderMaterial;
    world.update(1, 1, new PerspectiveCamera());
    expect(water.uniforms.uTime!.value).toBe(0);
    const clouds = world.root.getObjectByName(
      "celestial-volume-clouds"
    ) as Mesh;
    expect((clouds.material as ShaderMaterial).uniforms.uTime!.value).toBe(0);
    const fall = world.root.getObjectByName("cloudbreak-waterfall")!
      .children[0] as Mesh;
    expect(
      (fall.material as import("three").ShaderMaterial).uniforms.uTime!.value
    ).toBe(0);
    world.dispose();
  });

  it("updates performer grounding, retained visibility, and disposes once", () => {
    const bundle = assets();
    const world = createCelestialEnvironmentWorld(
      { groundY: -1.5, worldYOffset: 0.25 },
      bundle
    );
    const clouds = world.root.getObjectByName(
      "celestial-volume-clouds"
    ) as Mesh;
    const noise = (clouds.material as ShaderMaterial).uniforms.uNoise!.value;
    const cloudTextureDispose = vi.spyOn(noise, "dispose");
    world.setGroundY(-2);
    expect(
      world.root.getObjectByName("celestial-cloudbreak-world")!.position.y
    ).toBe(-1.75);
    expect(world.reflector.position.y).toBeCloseTo(
      -2 + 0.25 + CLOUDBREAK_LAYOUT.lagoon.surfaceY + 0.035,
      6
    );
    world.setActive(false);
    expect(world.root.visible).toBe(false);
    expect(world.reflector.visible).toBe(false);
    world.setActive(true);
    expect(world.root.visible).toBe(true);
    expect(world.reflector.visible).toBe(true);

    world.dispose();
    world.dispose();
    expect(cloudTextureDispose).toHaveBeenCalledTimes(1);
  });

  it("keeps disabled optional atmosphere out of the default graph", () => {
    const config = createDefaultCelestialConfig();
    const world = createCelestialEnvironmentWorld(
      { config, groundY: -1.5 },
      assets()
    );
    expect(
      world.root.getObjectByName("celestial-cloud-sky-dome")
    ).toBeDefined();
    expect(world.root.getObjectByName("celestial-god-rays")).toBeUndefined();
    world.dispose();
  });
});
