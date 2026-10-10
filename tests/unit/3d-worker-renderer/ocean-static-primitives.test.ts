import { describe, expect, it, vi } from "vitest";
import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Vector3,
} from "three";
import { createOceanDepthGradient } from "#lib/shared/3d/environments/worlds/ocean/ocean-depth-gradient.js";
import { createOceanWaterSurface } from "#lib/shared/3d/environments/worlds/ocean/ocean-water-surface.js";
import { createOceanGodRayShafts } from "#lib/shared/3d/environments/worlds/ocean/ocean-god-ray-shafts.js";
import { createOceanMarineParticles } from "#lib/shared/3d/environments/worlds/ocean/ocean-marine-particles.js";
import { createOceanRuinsPlatform } from "#lib/shared/3d/environments/worlds/ocean/ocean-ruins-platform.js";
import { createOceanLightingRig } from "#lib/shared/3d/environments/worlds/ocean/ocean-lighting-rig.js";
import {
  createOceanAuthoredFloraController,
  enhanceOceanSeabed,
} from "#lib/shared/3d/environments/worlds/ocean/ocean-authored-flora.js";

describe("Ocean renderer-neutral primitives", () => {
  it("keeps the depth dome centred on the active camera", () => {
    const world = createOceanDepthGradient();
    const camera = new PerspectiveCamera();
    camera.position.set(4, 5, 6);

    world.update(camera);

    expect(world.object.position.toArray()).toEqual([4, 5, 6]);
    expect(world.object.renderOrder).toBe(-1);
    expect(world.object.frustumCulled).toBe(false);
    world.dispose();
  });

  it("builds the production water shader and advances its camera uniforms", () => {
    const world = createOceanWaterSurface({ groundY: -1.5 });
    const camera = new PerspectiveCamera();
    camera.position.set(1, 2, 3);

    world.update(0.25, camera);

    expect(world.object.rotation.x).toBe(-Math.PI / 2);
    expect(world.object.material.forceSinglePass).toBe(true);
    expect(world.object.material.uniforms.uTime!.value).toBe(0.25);
    expect(
      (world.object.material.uniforms.uCameraPosition!.value as Vector3).toArray()
    ).toEqual([1, 2, 3]);
    const previousY = world.object.position.y;
    world.setGroundY(-2);
    expect(world.object.position.y).toBe(previousY - 0.5);
    world.dispose();
  });

  it("owns and releases each primitive's GPU resources", () => {
    const depth = createOceanDepthGradient();
    const water = createOceanWaterSurface();
    const depthGeometry = vi.spyOn(depth.object.geometry, "dispose");
    const depthMaterial = vi.spyOn(depth.object.material, "dispose");
    const waterGeometry = vi.spyOn(water.object.geometry, "dispose");
    const waterMaterial = vi.spyOn(water.object.material, "dispose");

    depth.dispose();
    water.dispose();

    expect(depthGeometry).toHaveBeenCalledOnce();
    expect(depthMaterial).toHaveBeenCalledOnce();
    expect(waterGeometry).toHaveBeenCalledOnce();
    expect(waterMaterial).toHaveBeenCalledOnce();
  });

  it("builds the production god-ray population with a live enable control", () => {
    const world = createOceanGodRayShafts({ groundY: -1.5 });

    expect(world.object.count).toBe(14);
    expect(world.object.geometry.getAttribute("aOpacityMult").count).toBe(14);
    world.setEnabled(false);
    expect(world.object.material.uniforms.uIntensity!.value).toBe(0);
    world.update(0.5);
    expect(world.object.material.uniforms.uTime!.value).toBeCloseTo(0.75);
    world.dispose();
  });

  it("keeps the production marine particle field renderer-neutral", () => {
    const world = createOceanMarineParticles({
      count: 12,
      groundY: -1.5,
      random: () => 0.5,
    });

    expect(world.object.geometry.getAttribute("position").count).toBe(12);
    expect(world.object.position.y).toBe(-1.5);
    world.update(0.25);
    expect(world.object.material.uniforms.uTime!.value).toBe(0.25);
    world.setGroundY(-2);
    expect(world.object.position.y).toBe(-2);
    world.dispose();
  });

  it("builds the exact Ocean ruins hierarchy and responds to live placement", () => {
    const config = {
      enabled: true,
      width: 8,
      depth: 6,
      height: 0.5,
      elevation: 0.5,
      stoneColor: "#9d9482",
      runeGlowColor: "#44ddaa",
      glowIntensity: 0.55,
      mossIntensity: 0.8,
      columnCount: 6,
      groundOffset: 1.5,
      zOffset: 2,
    };
    const world = createOceanRuinsPlatform(config, -1.5);
    const meshes = world.object.children.filter(
      (child): child is Mesh => child instanceof Mesh
    );

    // Body + deck + six broken columns + six supports.
    expect(meshes).toHaveLength(14);
    expect(world.object.position.z).toBe(2);
    expect(meshes[0]!.position.y).toBe(0.75);
    expect(meshes[1]!.rotation.x).toBe(-Math.PI / 2);

    world.setGroundY(-2);
    expect((world.object.children[0] as Mesh).position.y).toBe(0.25);
    world.setConfig({ ...config, enabled: false });
    expect(world.object.visible).toBe(false);
    world.dispose();
    expect(world.object.children).toHaveLength(0);
  });

  it("builds Ocean's exact motivated lighting rig", () => {
    const world = createOceanLightingRig({
      groundY: -1.5,
      hemisphereEnabled: true,
    });
    const [hemisphere, sun, target, key, rightTorch, leftTorch] =
      world.object.children;

    expect(world.object.children).toHaveLength(6);
    expect(hemisphere!.name).toBe("OceanHemisphereFill");
    expect(sun).toBe(world.sunLight);
    expect(world.sunLight.intensity).toBe(0.28);
    expect(world.sunLight.castShadow).toBe(true);
    expect(target!.name).toBe("OceanKeyTarget");
    expect(key!.name).toBe("OceanStageKey");
    expect(rightTorch!.position.toArray()).toEqual([6.2, 1.9, 2.25]);
    expect(leftTorch!.position.toArray()).toEqual([-6.2, 1.9, 2.25]);

    world.setHemisphereEnabled(false);
    expect((hemisphere as import("three").HemisphereLight).intensity).toBe(0);
    world.setGroundY(-2);
    expect(target!.position.y).toBe(0.5);
    world.dispose();
    expect(world.object.children).toHaveLength(0);
  });

  it("applies the same seabed and authored-flora material policy in every renderer", () => {
    const seabedMaterial = new MeshStandardMaterial();
    const seabed = new Mesh(new BoxGeometry(4, 0.2, 4), seabedMaterial);
    enhanceOceanSeabed(seabed, { enableCaustics: true });
    expect(seabed.castShadow).toBe(false);
    expect(seabed.receiveShadow).toBe(true);
    expect(seabedMaterial.userData.causticsPatched).toBe(true);

    const flora = new Group();
    const tallMaterial = new MeshStandardMaterial();
    const tallPlant = new Mesh(new BoxGeometry(0.2, 3, 0.2), tallMaterial);
    const instancedMaterial = new MeshStandardMaterial();
    const instancedCoral = new InstancedMesh(
      new BoxGeometry(1, 1, 1),
      instancedMaterial,
      2,
    );
    instancedCoral.setMatrixAt(0, new Matrix4().makeTranslation(-1, 0, 0));
    instancedCoral.setMatrixAt(1, new Matrix4().makeTranslation(1, 0, 0));
    flora.add(tallPlant, instancedCoral);

    const controller = createOceanAuthoredFloraController(flora, {
      groundY: -1.5,
      swayEnabled: true,
    });
    const camera = new PerspectiveCamera();
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    expect(tallMaterial.userData.swayPatched).toBe(true);
    expect(tallMaterial.userData.causticsPatched).toBe(true);
    expect(instancedCoral.castShadow).toBe(false);
    expect(instancedCoral.receiveShadow).toBe(true);
    expect(controller.update(0.25, camera).sourceBatches).toBe(1);
    controller.setGroundY(-2);
    expect(tallMaterial.userData.swayUniforms.uGroundY.value).toBe(-2);
    controller.setSwayEnabled(false);
    expect(tallMaterial.userData.swayUniforms.uSwayStrength.value).toBe(0);
    controller.dispose();

    seabed.geometry.dispose();
    seabedMaterial.dispose();
    tallPlant.geometry.dispose();
    tallMaterial.dispose();
    instancedCoral.geometry.dispose();
    instancedMaterial.dispose();
  });
});
