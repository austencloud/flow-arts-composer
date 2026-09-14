import { describe, expect, it, vi } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Texture,
  Raycaster,
  Vector3,
  ShaderLib,
  type WebGLProgramParametersWithUniforms,
  type WebGLRenderer,
} from "three";

import { QualityTier } from "$lib/shared/3d/effects/types";
import { createDefaultEmberConfig } from "$lib/shared/3d/environments/domain/models/scene-configs";
import {
  EMBER_AUTHORED_RESOURCE_URLS,
  type EmberEnvironmentAssets,
} from "$lib/shared/3d/environments/worlds/ember/ember-environment-assets";
import {
  createEmberEnvironmentWorld,
  type EmberEnvironmentWorld,
} from "$lib/shared/3d/environments/worlds/ember/ember-environment-world";

function model(name: string): Group {
  const root = new Group();
  root.name = name;
  root.add(
    new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ color: "#ffffff" })
    )
  );
  return root;
}

function geometryLoader(): GLTFLoader {
  // jsdom cannot decode the embedded atlas. Real texture decoding and the
  // baked shading are checked in both browser renderers, not mocked here.
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).register(() => ({
    name: "geometry-test-textures",
    loadTexture: async () => new Texture(),
  }));
}

function assets(): EmberEnvironmentAssets {
  const productionSlice = new Group();
  const basinMaterial = new MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.5,
    metalness: 0.5,
  });
  basinMaterial.name = "Ember Living Basin";
  const basin = new Mesh(new PlaneGeometry(40, 40, 4, 4), basinMaterial);
  basin.name = "Ember_Volcanic_Basin_living_caldera";
  basin.userData.tka_role = "volcanic-basin";
  basin.rotation.x = -Math.PI / 2;
  const fissure = new Mesh(
    new PlaneGeometry(2, 2),
    new MeshStandardMaterial({ color: "#ffffff" })
  );
  fissure.name = "Ember_Buried_Fissure";
  fissure.userData.tka_role = "live-fissure";
  productionSlice.add(basin, fissure);
  return {
    productionSlice,
    largeLog: model("large-log"),
    smallLog: model("small-log"),
    campfire: model("campfire"),
    skyMoonTexture: new Texture(),
    detailMaps: {
      youngLava: new Texture(),
      ironContact: new Texture(),
      fracturedBasalt: new Texture(),
      shelteredAsh: new Texture(),
    },
    surfaceMaps: { height: new Texture() },
    familyMask: new Texture(),
  };
}

function createWorld(bundle = assets()): {
  world: EmberEnvironmentWorld;
  bundle: EmberEnvironmentAssets;
} {
  return {
    bundle,
    world: createEmberEnvironmentWorld(
      {
        renderer: {} as WebGLRenderer,
        groundY: -1.5,
        qualityTier: QualityTier.HIGH,
        random: () => 0.5,
      },
      bundle
    ),
  };
}

// Parsing the authored GLBs through meshopt takes 25-35 s on a loaded CI
// runner, right at vitest's 30 s default, and this file gates the production
// deploy. Give the real asset parse the budget it needs instead of letting
// runner speed decide whether main is green.
vi.setConfig({ testTimeout: 120_000 });

describe("Ember renderer-neutral production world", () => {
  it("preserves the completed foreground and keeps the cooled plate above its footing", async () => {
    const loader = geometryLoader();
    const load = async (path: string) => {
      const bytes = readFileSync(path);
      const data = new Uint8Array(bytes.length);
      data.set(bytes);
      const gltf = await loader.parseAsync(data.buffer, "");
      gltf.scene.updateMatrixWorld(true);
      return gltf.scene;
    };
    const [baseline, current] = await Promise.all([
      load("static/models/ember/ember-geology-stage-r1.glb"),
      load("static/models/ember/ember-production-slice.glb"),
    ]);
    let channels = 0;
    baseline.traverse((node) => {
      const before = node as Mesh;
      if (!before.isMesh) return;
      if (
        before.name === "EMBER_LavaSimulatorDeposit" ||
        before.userData.ember_flow_surface
      )
        channels++;
      const after = current.getObjectByName(before.name) as Mesh;
      for (const attribute of Object.keys(before.geometry.attributes)) {
        const a = after.geometry.getAttribute(attribute).array;
        const b = before.geometry.getAttribute(attribute).array;
        expect(
          Buffer.from(a.buffer, a.byteOffset, a.byteLength).equals(
            Buffer.from(b.buffer, b.byteOffset, b.byteLength)
          )
        ).toBe(true);
      }
      expect(after.matrixWorld.elements).toEqual(before.matrixWorld.elements);
      expect(after.userData.ember_flow_paths).toEqual(
        before.userData.ember_flow_paths
      );
    });
    expect(channels).toBe(6);
    let backdropTriangles = 0;
    let backdropMeshes = 0;
    current.traverse((node) => {
      if (node.userData.ember_backdrop !== true) return;
      const mesh = node as Mesh;
      backdropMeshes++;
      backdropTriangles +=
        (mesh.geometry.index?.count ??
          mesh.geometry.getAttribute("position").count) / 3;
      expect(node.userData.tka_camera_collision).toBe(false);
      const ray = new Raycaster(new Vector3(0, 500, 0), new Vector3(0, -1, 0));
      expect(ray.intersectObject(mesh)).toHaveLength(0);
    });
    expect(backdropMeshes).toBe(2);
    expect(backdropTriangles).toBeLessThan(140000);
    // The exported bed must descend, not just a separately authored path.
    // Sample the actual heat mesh so optimization cannot hide an uphill step.
    const outflow = current.getObjectByName("EMBER_DistantValleyHeat") as Mesh;
    const profile = outflow.userData.ember_drainage_profile as number[][];
    expect(profile.length).toBeGreaterThan(500);
    const sample = new Vector3();
    const flowRay = new Raycaster(new Vector3(), new Vector3(0, -1, 0));
    let previousY = Infinity;
    let firstY = 0;
    for (let index = 1; index < profile.length; index += 12) {
      // glTF rotates Blender-local coordinates; meshopt then adds a geometry
      // decode transform that must not be applied to unquantized metadata.
      // Mid-segment samples avoid quantization shifting the open end boundary
      // a few millimetres past an otherwise exact edge ray.
      const [x, y, z] = profile[index].map(
        (value, axis) => (value + profile[index - 1][axis]) / 2
      );
      sample.set(x, z, -y).applyMatrix4(outflow.parent!.matrixWorld);
      flowRay.ray.origin.set(sample.x, 500, sample.z);
      const hit = flowRay.intersectObject(outflow)[0];
      expect(hit).toBeDefined();
      if (index === 1) firstY = hit.point.y;
      expect(hit.point.y).toBeLessThanOrEqual(previousY + 0.025);
      previousY = hit.point.y;
    }
    expect(firstY - previousY).toBeGreaterThan(100);
    // These exported triangle interiors used to clear the valley by only
    // 3–4 cm. Animated heave could expose black terrain through the melt.
    const valley = current.getObjectByName("EMBER_DistantValley") as Mesh;
    for (const [x, z] of [
      [18.958, -166.001],
      [-2.22, -237.988],
      [-2.452, -237.657],
      [-2.452, -237.988],
    ]) {
      flowRay.ray.origin.set(x, 500, z);
      const lavaHit = flowRay.intersectObject(outflow)[0];
      const rockHit = flowRay.intersectObject(valley)[0];
      expect(lavaHit).toBeDefined();
      expect(rockHit).toBeDefined();
      expect(lavaHit.point.y - rockHit.point.y).toBeGreaterThan(0.09);
      expect(lavaHit.point.y - rockHit.point.y).toBeLessThan(0.5);
    }
    const stage = current.getObjectByName(
      "EMBER_CooledPerformancePlate"
    ) as Mesh;
    const terrain = current.getObjectByName("EMBER_Terrain") as Mesh;
    const ray = new Raycaster(new Vector3(), new Vector3(0, -1, 0));
    const samples = [
      [0, 0],
      ...Array.from({ length: 8 }, (_, i) => [
        Math.cos((i * Math.PI) / 4) * 4.2,
        Math.sin((i * Math.PI) / 4) * 4.2,
      ]),
    ];
    for (const [x, z] of samples) {
      ray.ray.origin.set(x, 200, z);
      const plateHit = ray.intersectObject(stage)[0];
      const groundHit = ray.intersectObject(terrain)[0];
      expect(plateHit).toBeDefined();
      const clearance = plateHit.point.y - groundHit.point.y;
      expect(clearance).toBeGreaterThan(0.005);
      expect(clearance).toBeLessThan(0.04);
    }
    expect((stage.material as MeshStandardMaterial).emissive.getHex()).toBe(0);
    const fractures = current.getObjectByName(
      "EMBER_CooledPlatePeripheralFractures"
    ) as Mesh;
    const fractureVertices = fractures.geometry.getAttribute("position");
    const point = new Vector3();
    for (let index = 0; index < fractureVertices.count; index++) {
      point
        .fromBufferAttribute(fractureVertices, index)
        .applyMatrix4(fractures.matrixWorld);
      expect(Math.hypot(point.x, point.z)).toBeGreaterThan(4.5);
    }
  });

  it("delivers the approved datum and slope without resurrecting the runtime platform", async () => {
    const path = "static/models/ember/ember-production-slice.glb";
    const bytes = readFileSync(path);
    const loader = geometryLoader();
    const data = new Uint8Array(bytes.length);
    data.set(bytes);
    const gltf = await loader.parseAsync(data.buffer, "");
    const bundle = assets();
    bundle.productionSlice = gltf.scene;
    const valley = gltf.scene.getObjectByName("EMBER_DistantValley") as Mesh;
    const bakedMap = (valley.material as MeshStandardMaterial).map;
    expect(bakedMap).not.toBeNull();
    const source = gltf.scene.getObjectByName("EMBER_Terrain") as Mesh;
    const positions = source.geometry.getAttribute("position").array.slice();
    const world = createEmberEnvironmentWorld(
      {
        renderer: {} as WebGLRenderer,
        groundY: -1.5,
        stageRadiusGrowth: 8,
        reducedMotion: true,
        random: () => 0.5,
      },
      bundle
    );
    world.root.updateMatrixWorld(true);
    expect((valley.material as MeshStandardMaterial).map).toBe(bakedMap);
    world.root.traverse((node) => {
      if (node.userData.ember_backdrop !== true) return;
      const mesh = node as Mesh;
      expect(mesh.castShadow).toBe(false);
      expect(mesh.receiveShadow).toBe(false);
      if (node.userData.ember_distant_flow_surface === true) {
        const near = world.root.getObjectByName(
          "EMBER_LavaSimulatorDeposit"
        ) as Mesh;
        expect(mesh.material).toBeInstanceOf(MeshStandardMaterial);
        expect((mesh.material as MeshStandardMaterial).onBeforeCompile).toBe(
          (near.material as MeshStandardMaterial).onBeforeCompile
        );
        expect((mesh.material as MeshStandardMaterial).fog).toBe(true);
        return;
      }
      expect((mesh.material as MeshStandardMaterial).fog).toBe(false);
      expect(Array.isArray(mesh.material)).toBe(false);
      expect((mesh.material as MeshStandardMaterial).type).toBe(
        "MeshBasicMaterial"
      );
    });
    expect(
      (world.root.getObjectByName("EMBER_CooledPerformancePlate") as Mesh)
        .castShadow
    ).toBe(false);
    expect(
      (
        world.root.getObjectByName(
          "EMBER_CooledPlatePeripheralFractures"
        ) as Mesh
      ).castShadow
    ).toBe(false);
    const ray = new Raycaster(new Vector3(0, 200, 0), new Vector3(0, -1, 0));
    expect(ray.intersectObject(source, true)[0].point.y).toBeCloseTo(-1, 1);
    expect(source.geometry.getAttribute("position").array).toEqual(positions);
    expect(world.config.platform.enabled).toBe(false);
    expect(world.root.getObjectByName("EmberLavaRivers")).toBeUndefined();
    expect(world.root.getObjectByName("ember-surface-ecology")).toBeUndefined();
    expect(world.root.getObjectByName("EMBER_PerformerProxy")).toBeUndefined();
    expect(statSync(path).size).toBeLessThan(7_000_000);
    const surface = world.root.getObjectByName(
      "EMBER_LavaSimulatorDeposit"
    ) as Mesh;
    const material = surface.material as MeshStandardMaterial;
    const shader = {
      uniforms: {},
      vertexShader: ShaderLib.standard.vertexShader,
      fragmentShader: ShaderLib.standard.fragmentShader,
    } as WebGLProgramParametersWithUniforms;
    material.onBeforeCompile(shader, {} as WebGLRenderer);
    const time = shader.uniforms.uMidflankTime;
    world.update(1, 10, new PerspectiveCamera());
    expect(time.value).toBe(0);
    const dispose = vi.spyOn(material, "dispose");
    world.dispose();
    world.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("keeps the R5 material color instead of whitening untextured basalt", () => {
    const bundle = assets();
    const terrain = bundle.productionSlice.children[0] as Mesh;
    terrain.name = "EMBER_Terrain";
    const material = terrain.material as MeshStandardMaterial;
    material.name = "Ember_Midflank_R5_basalt";
    material.color.setRGB(0.075, 0.082, 0.083);
    const color = material.color.clone();
    const { world } = createWorld(bundle);
    expect(material.color).toEqual(color);
    world.dispose();
  });
  it("declares every authored GLB and support texture used by production", () => {
    expect(EMBER_AUTHORED_RESOURCE_URLS).toEqual([
      "/models/ember/ember-production-slice.glb",
      "/models/camping/tree-log.glb",
      "/models/camping/tree-log-small.glb",
      "/models/camping/campfire-pit.glb",
      "/textures/moon.png",
      "/textures/ember-surface-r9/young-lava.png",
      "/textures/ember-surface-r9/iron-contact.png",
      "/textures/ember-midflank-r5/rock-ground-color.jpg",
      "/textures/ember-surface-r9/sheltered-ash.png",
      "/textures/ember-surface-r11/rock-ground-height.jpg",
      "/textures/ember-midflank-r5/family-mask.png",
    ]);
  });

  it("builds the authored terrain, lava, atmosphere, lights, and globals", () => {
    const { world, bundle } = createWorld();
    const names: string[] = [];
    world.root.traverse((object) => names.push(object.name));

    expect(world.root.name).toBe("ember-environment-world");
    expect(world.root.children).toContain(bundle.productionSlice);
    for (const name of [
      "EmberSkyGradient",
      "ember-surface-ecology",
      "EmberLavaRivers",
      "EmberParticles",
      "EmberAsh",
      "EmberSmoke",
      "EmberVolcanicHaze",
      "EmberPlumes",
      "EmberCalderaLight",
      "EmberHemisphereLight",
      "EmberSkyLight",
    ]) {
      expect(names, name).toContain(name);
    }
    expect(world.fog.color.getHexString()).toBe("3f2018");
    expect(world.fog.density).toBe(0.0042);
    expect(world.background.getHexString()).toBe("3f2018");
    expect(world.config.atmosphere.id).toBe("blackglass-inferno");
    expect(
      bundle.productionSlice.getObjectByName("Ember_Buried_Fissure")!.visible
    ).toBe(false);
    const basin = bundle.productionSlice.getObjectByName(
      "Ember_Volcanic_Basin_living_caldera"
    ) as Mesh;
    expect(basin.castShadow).toBe(false);
    expect(basin.receiveShadow).toBe(true);
    expect(bundle.productionSlice.userData.emberAtmosphereLook).toBe(
      "blackglass-inferno"
    );
    world.dispose();
  });

  it("updates camera-following sky and haze and tracks performer ground", () => {
    const { world, bundle } = createWorld();
    const camera = new PerspectiveCamera();
    camera.position.set(4, 8, 12);
    world.update(0.25, 0.25, camera);
    expect(
      world.root.getObjectByName("EmberSkyGradient")!.position.toArray()
    ).toEqual([4, 8, 12]);
    expect(
      world.root.getObjectByName("EmberVolcanicHaze")!.position.toArray()
    ).toEqual([4, 8, 12]);

    world.setGroundY(-2.25);
    expect(bundle.productionSlice.position.y).toBe(-2.25);
    expect(world.root.getObjectByName("ember-horizon-apron")!.position.y).toBe(
      -2.25
    );
    world.setActive(false);
    expect(world.root.visible).toBe(false);
    world.dispose();
  });

  it("retains exact optional fire, pool, cracks, pillars, fountain, and platform paths", () => {
    const config = createDefaultEmberConfig();
    config.lavaCracks.enabled = true;
    config.lavaPool.enabled = true;
    config.obsidianPillars.enabled = true;
    config.fireWisps!.enabled = true;
    config.emberFountains!.enabled = true;
    config.fireVent = {
      enabled: true,
      position: { x: 2, z: 3 },
      modelScale: 1,
      fireScale: 1.2,
      fireHeight: 2,
      primaryLight: {
        color: "#ff4400",
        intensity: 20,
        distance: 10,
        decay: 2,
        heightOffset: 2,
      },
      fillLight: {
        color: "#ffaa00",
        intensity: 8,
        distance: 7,
        decay: 2,
        heightOffset: 1,
      },
      smokeColors: ["#221111"],
      smokeCount: 8,
    };
    config.platform.enabled = true;
    const bundle = assets();
    const world = createEmberEnvironmentWorld(
      {
        renderer: {} as WebGLRenderer,
        groundY: -1.5,
        config,
        qualityTier: QualityTier.HIGH,
        random: () => 0.5,
      },
      bundle
    );
    const names: string[] = [];
    world.root.traverse((object) => names.push(object.name));
    for (const name of [
      "EmberLavaCracks",
      "EmberLavaPool",
      "EmberObsidianPillars",
      "EmberFireVent",
      "SharedVolumetricFire",
      "EmberFireWisps",
      "EmberFountains",
      "EmberObsidianPlatform",
    ]) {
      expect(names, name).toContain(name);
    }
    expect(names.filter((name) => name.startsWith("EmberLog_"))).toHaveLength(
      6
    );
    world.dispose();
  });

  it("disposes its loaded textures once and ignores repeated disposal", () => {
    const bundle = assets();
    const spies = [
      bundle.skyMoonTexture,
      ...Object.values(bundle.detailMaps),
      ...Object.values(bundle.surfaceMaps),
      bundle.familyMask,
    ].map((texture) => vi.spyOn(texture, "dispose"));
    const world = createWorld(bundle).world;
    world.dispose();
    world.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });
});
