import { describe, expect, it, vi } from "vitest";
import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  ShaderMaterial,
  Texture,
  Vector3,
} from "three";
import { createDefaultWinterConfig } from "#lib/shared/3d/environments/domain/models/scene-configs.js";
import { createWinterEnvironmentWorld } from "#lib/shared/3d/environments/worlds/winter/winter-environment-world.js";
import { getStageCoordinateFrame } from "#lib/shared/3d/environments/domain/stage-coordinate-frame.js";
import { BackgroundType } from "@austencloud/backgrounds";

function authoredEnvironment() {
  const root = new Group();
  root.name = "winter-authored-fixture";
  const sharedGeometry = new BoxGeometry();
  const sharedMaterial = new MeshBasicMaterial();
  const base = new Mesh(sharedGeometry, sharedMaterial);
  base.name = "Winter_Base_HeroFir";
  const medium = new Mesh(sharedGeometry, sharedMaterial);
  medium.name = "Winter_Medium_Drift";
  const high = new Mesh(sharedGeometry, sharedMaterial);
  high.name = "Winter_High_Ridge";
  const instances = new InstancedMesh(sharedGeometry, sharedMaterial, 10);
  instances.name = "Winter_Instances";
  root.add(base, medium, high, instances);
  return { root, base, medium, high, instances };
}

function testWorld(overrides: Record<string, unknown> = {}) {
  const environment = authoredEnvironment();
  const config = createDefaultWinterConfig();
  config.starfield.count = 4;
  config.snow.count = 4;
  config.campfire!.smokeCount = 2;
  config.cabin.smoke.count = 2;
  const textures: Texture[] = [];
  const world = createWinterEnvironmentWorld({
    environmentRoot: environment.root,
    config,
    groundY: -1.5,
    stageRadius: 3,
    deviceTier: "medium",
    random: () => 0.5,
    loadTexture: () => {
      const texture = new Texture();
      textures.push(texture);
      return texture;
    },
    ...overrides,
  });
  return { world, environment, textures };
}

describe("createWinterEnvironmentWorld", () => {
  it("constructs every production Winter layer and complete light rig", () => {
    const { world } = testWorld();
    const names = new Set<string>();
    world.root.traverse((object) => names.add(object.name));

    expect([...names]).toEqual(
      expect.arrayContaining([
        "winter-sky-gradient",
        "winter-starfield",
        "winter-authored-fixture",
        "winter-pond",
        "winter-snow",
        "SharedVolumetricFire",
        "winter-campfire-steam",
        "winter-cabin-smoke",
        "winter-campfire-primary-light",
        "winter-campfire-fill-light",
        "winter-cabin-window-light",
        "winter-hemisphere-light",
        "winter-moon-light",
        "winter-ice-platform-body",
        "winter-ice-platform-snow-collar",
        "winter-ice-platform-surface",
      ])
    );
    const lights: string[] = [];
    world.root.traverse((child) => {
      if (child.type.endsWith("Light")) lights.push(child.name);
    });
    expect(lights).toHaveLength(8);
    expect(world.fog.density).toBe(0.0045);
    expect(world.background.getHexString()).toBe("617487");
    world.dispose();
  });

  it("applies the authored quality tier without silently dropping base scenery", () => {
    const { world, environment } = testWorld();

    expect(world.tier).toBe("medium");
    expect(environment.base.visible).toBe(true);
    expect(environment.medium.visible).toBe(true);
    expect(environment.high.visible).toBe(false);
    expect(environment.instances.count).toBe(8);
    expect(environment.base.castShadow).toBe(false);
    expect(environment.base.receiveShadow).toBe(true);
    world.dispose();
  });

  it("preserves stage sizing, stage offset, animation clocks and ground changes", () => {
    const { world, environment } = testWorld({
      stageRadius: 8,
      stageZOffset: 1.25,
    });
    const platform = world.root.getObjectByName("winter-ice-platform")!;
    const surface = world.root.getObjectByName(
      "winter-ice-platform-surface"
    ) as Mesh<BoxGeometry, ShaderMaterial>;
    const sky = world.root.getObjectByName("winter-sky-gradient")!;
    const pond = world.root.getObjectByName("winter-pond")!;
    const fire = world.root.getObjectByName("SharedVolumetricFire")!;
    const camera = new PerspectiveCamera();
    camera.position.set(4, 5, 6);

    expect(platform.position.z).toBe(1.25);
    expect(surface.material.uniforms.uRadius!.value).toBe(8);
    world.update(0.25, camera);
    expect(surface.material.uniforms.uTime!.value).toBeCloseTo(0.25);
    expect(sky.position.toArray()).toEqual([4, 5, 6]);

    world.setGroundY(-2.25);
    expect(environment.root.position.y).toBe(-2.25);
    expect(pond.position.y).toBeCloseTo(-2.1);
    expect(fire.position.y).toBeCloseTo(-2.25 + 0.4 + 0.884);
    world.dispose();
  });

  it("honors platform visibility and releases generated resources once", () => {
    const { world, environment, textures } = testWorld({
      platformVisible: false,
    });
    expect(world.root.getObjectByName("winter-ice-platform")).toBeUndefined();
    const textureDisposals = textures.map((texture) =>
      vi.fn().mockImplementation(() => undefined)
    );
    textures.forEach((texture, index) => {
      texture.dispose = textureDisposals[index]!;
    });
    const geometryDispose = vi.spyOn(environment.base.geometry, "dispose");

    world.dispose();
    world.dispose();

    for (const dispose of textureDisposals) {
      expect(dispose).toHaveBeenCalledTimes(1);
    }
    // Both loader adapters dispose their private GLB tree after the shared
    // world releases it; the world only disposes the effects it creates.
    expect(geometryDispose).not.toHaveBeenCalled();
  });

  it("keeps the Blender floor on the foot plane while clearing a larger cast", () => {
    const asset = new Group();
    const floor = new Mesh(
      new BoxGeometry(15.4, 0.45, 15.4),
      new MeshBasicMaterial()
    );
    floor.position.y = 0.225;
    floor.userData.bluehourRole = "court";
    asset.add(floor);
    const { world } = testWorld({ environmentRoot: asset });
    expect(world.root.getObjectByName("winter-ice-platform")).toBeUndefined();
    const frame = getStageCoordinateFrame(BackgroundType.WINTER, true);
    for (const [ground, radius, growth] of [
      [-1.5, 3, 0],
      [-2, 12, 3.5],
      [-1, 4, 1.5],
    ]) {
      world.setLayout(ground!, radius!, growth!, frame.environmentYOffset);
      world.root.updateMatrixWorld(true);
      expect(floor.localToWorld(new Vector3(0, 0.225, 0)).y).toBeCloseTo(
        ground! + frame.performerAnchorY
      );
      expect(asset.parent!.scale.x * 7.7).toBeGreaterThanOrEqual(radius!);
      expect(asset.parent!.scale.y).toBe(1);
    }
    world.dispose();
  });

  it("freezes snow, stars, and fire when reduced motion is requested", () => {
    const { world } = testWorld({ motionScale: 0 });
    const fire = world.root.getObjectByName("SharedVolumetricFire") as Mesh<
      BoxGeometry,
      ShaderMaterial
    >;
    const before = fire.material.uniforms.uTime!.value;
    const particles = world.root.getObjectByName("winter-snow") as Mesh<
      BoxGeometry,
      ShaderMaterial
    >;
    const snowBefore = Array.from(
      particles.geometry.getAttribute("position").array
    );
    const stars = world.root.getObjectByName("winter-starfield") as Mesh<
      BoxGeometry,
      ShaderMaterial
    >;
    const starTime = stars.material.uniforms.uTime!.value;
    world.update(1, new PerspectiveCamera());
    expect(fire.material.uniforms.uTime!.value).toBe(before);
    expect(
      Array.from(particles.geometry.getAttribute("position").array)
    ).toEqual(snowBefore);
    expect(stars.material.uniforms.uTime!.value).toBe(starTime);
    world.setMotionScale(1);
    world.update(0.1, new PerspectiveCamera());
    expect(fire.material.uniforms.uTime!.value).toBeGreaterThan(before);
    expect(
      Array.from(particles.geometry.getAttribute("position").array)
    ).not.toEqual(snowBefore);
    world.dispose();
  });
});
