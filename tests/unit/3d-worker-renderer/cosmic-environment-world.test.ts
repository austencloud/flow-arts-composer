import { describe, expect, it, vi } from "vitest";
import {
  BoxGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  ShaderMaterial,
  type SpotLight,
  Texture,
  Vector2,
  Vector3,
  type WebGLRenderer,
} from "three";
import { createDefaultCosmicNightConfig } from "#lib/shared/3d/environments/domain/models/scene-configs.js";
import {
  createCosmicEnvironmentWorld,
  type CosmicEnvironmentWorldOptions,
} from "#lib/shared/3d/environments/worlds/cosmic/cosmic-environment-world.js";
import type { CosmicAudienceLoader } from "#lib/shared/3d/environments/worlds/cosmic/cosmic-audience.js";
import { MOON_APRON_HEIGHT } from "#lib/shared/3d/environments/worlds/cosmic/moon-outpost-layout.js";

function renderer(): WebGLRenderer {
  return {
    getSize(target: Vector2) {
      return target.set(1920, 1080);
    },
  } as unknown as WebGLRenderer;
}

function audienceLoader(): CosmicAudienceLoader & {
  preloadAll: ReturnType<typeof vi.fn>;
  prepareFigure: ReturnType<typeof vi.fn>;
} {
  return {
    preloadAll: vi.fn(async () => undefined),
    prepareFigure: vi.fn(async () => ({ scene: new Group(), clip: null })),
  };
}

function authoredMesh(name: string, material: string, at = new Vector3()): Mesh {
  const standard = new MeshStandardMaterial({ emissiveIntensity: 8 });
  standard.name = material;
  const mesh = new Mesh(new BoxGeometry(0.2, 0.2, 0.2), standard);
  mesh.name = name;
  mesh.position.copy(at);
  return mesh;
}

/** A stand-in for moon-outpost.glb with every node the runtime looks for. */
function authoredOutpost(): Group {
  const scene = new Group();
  const terrain = authoredMesh("MO_Terrain", "MO_Regolith");
  const rocks = authoredMesh("MO_Rocks", "MO_Rock");
  const tracks = authoredMesh("MO_RoverTracks", "MO_Track");
  // The optimiser merges identical materials, so the real bootprints arrive
  // wearing MO_Track; the fake does the same.
  const boots = authoredMesh("MO_Bootprints", "MO_Track");
  const habitat = new Group();
  habitat.name = "MO_Habitat";
  habitat.add(authoredMesh("MO_Habitat_hull", "MO_PanelWhite", new Vector3(12, 1, -18)));
  habitat.add(authoredMesh("MO_Habitat_lamp", "MO_AirlockLamp", new Vector3(11, 3, -15)));
  const comms = new Group();
  comms.name = "MO_CommsMast";
  comms.add(authoredMesh("MO_CommsMast_beacon", "MO_Beacon", new Vector3(-9, 9, -26)));
  scene.add(terrain, rocks, tracks, boots, habitat, comms);
  for (const name of [
    "MO_TemplateFloodMast",
    "MO_TemplateCargoA",
    "MO_TemplateCargoB",
    "MO_TemplateBench",
  ]) {
    scene.add(authoredMesh(name, "MO_MetalGrey"));
  }
  return scene;
}

function options(
  overrides: Partial<CosmicEnvironmentWorldOptions> = {}
): CosmicEnvironmentWorldOptions {
  return {
    renderer: renderer(),
    groundY: -1.5,
    assets: {
      authoredScene: authoredOutpost(),
      earthTexture: new Texture(),
    },
    audienceLoader: audienceLoader(),
    random: () => 0.25,
    ...overrides,
  };
}

function named(root: Object3D, prefix: string): Object3D[] {
  const found: Object3D[] = [];
  root.traverse((object) => {
    if (object.name.startsWith(prefix)) found.push(object);
  });
  return found;
}

function horizontalDistance(object: Object3D): number {
  return Math.hypot(object.position.x, object.position.z);
}

/** The pad's lights ring its painted edge. */
function padPaintedRadius(root: Object3D): number {
  const lights = root.getObjectByName("MoonPadLights") as InstancedMesh;
  const matrix = new Matrix4();
  lights.getMatrixAt(0, matrix);
  const position = new Vector3().setFromMatrixPosition(matrix);
  return Math.hypot(position.x, position.z);
}

describe("createCosmicEnvironmentWorld", () => {
  it("builds the lunar outpost graph and seats nine on nine benches", async () => {
    const loader = audienceLoader();
    const world = await createCosmicEnvironmentWorld(
      options({ audienceLoader: loader })
    );
    await world.audienceReady;

    expect(world.root.children.map((child) => child.name)).toEqual([
      "MoonSky",
      "MoonStars",
      "MoonEarth",
      "MoonOrbiter",
      "MoonGround",
      "MoonHemisphereLight",
      "CosmicSeatedAudience",
    ]);
    const ground = world.root.getObjectByName("MoonGround")!;
    expect(ground.children.map((child) => child.name)).toEqual(
      expect.arrayContaining([
        "MoonOutpostRoot",
        "MoonLandingPad",
        "MoonPadEdge",
        "MoonSunLight",
        "MoonEarthlight",
        "MoonAirlockLight",
      ])
    );
    expect(
      world.root.getObjectByName("CosmicSeatedAudience")?.children
    ).toHaveLength(9);
    expect(named(world.root, "MoonBench-")).toHaveLength(9);
    expect(named(world.root, "MoonFloodMast-")).toHaveLength(3);
    expect(named(world.root, "MoonFloodLight-")).toHaveLength(3);
    expect(named(world.root, "MoonCargo-")).toHaveLength(2);
    expect(loader.preloadAll).toHaveBeenCalledOnce();
    expect(loader.prepareFigure).toHaveBeenCalledTimes(9);
    expect(world.platformExpanded).toBe(false);
    // Each ground surface gets its own shading, chosen by node where the
    // optimiser has merged the materials.
    const surfaceOf = (name: string) =>
      ((world.root.getObjectByName(name) as Mesh).material as MeshStandardMaterial)
        .userData.moonSurface;
    expect(surfaceOf("MO_Terrain")).toBe("regolith");
    expect(surfaceOf("MO_RoverTracks")).toBe("track");
    expect(surfaceOf("MO_Bootprints")).toBe("boot");
    // The authored track and print quads face into the ground, so they must
    // draw from both sides or they vanish seen from above.
    for (const name of ["MO_RoverTracks", "MO_Bootprints"]) {
      expect(
        ((world.root.getObjectByName(name) as Mesh).material as MeshStandardMaterial).side
      ).toBe(DoubleSide);
    }
    // There is no air: no fog, and none of the old nebula, dust or meteors.
    expect(world.fog.density).toBe(0);
    for (const gone of [
      "CosmicNebula",
      "CosmicDust",
      "CosmicMeteorStreaks",
      "CosmicEarthGodRays",
      "CosmicEnergyParticles",
      "CosmicEarthGlow",
    ]) {
      expect(world.root.getObjectByName(gone)).toBeUndefined();
    }

    world.dispose();
  });

  it("lets one sun vector drive the light, the Earth's day side and the sky", async () => {
    const world = await createCosmicEnvironmentWorld(options());
    const sun = world.root.getObjectByName("MoonSunLight") as DirectionalLight;
    const fromTarget = sun.position.clone().sub(sun.target.position).normalize();
    expect(fromTarget.distanceTo(world.sunDirection)).toBeLessThan(1e-6);

    const earth = world.root.getObjectByName("MoonEarthSurface") as Mesh;
    const earthSun = (earth.material as ShaderMaterial).uniforms
      .uSunDirection!.value as Vector3;
    expect(earthSun.distanceTo(world.sunDirection)).toBeLessThan(1e-6);
    const skySun = (
      (world.root.getObjectByName("MoonSkySphere") as Mesh)
        .material as ShaderMaterial
    ).uniforms.uSunDirection!.value as Vector3;
    expect(skySun.distanceTo(world.sunDirection)).toBeLessThan(1e-6);

    // Low and hard: 12 to 18 degrees up, across the opening view (which looks
    // down -Z) from one side rather than from behind the camera or ahead.
    const elevation = (Math.asin(world.sunDirection.y) * 180) / Math.PI;
    expect(elevation).toBeGreaterThanOrEqual(12);
    expect(elevation).toBeLessThanOrEqual(18);
    const across = Math.abs(world.sunDirection.x) /
      Math.hypot(world.sunDirection.x, world.sunDirection.z);
    expect(across).toBeGreaterThan(0.7);

    world.dispose();
  });

  it("casts the sun's shadows on the high tier only, like winter", async () => {
    const high = await createCosmicEnvironmentWorld(
      options({ qualityTier: "high" })
    );
    const highSun = high.root.getObjectByName("MoonSunLight") as DirectionalLight;
    expect(highSun.castShadow).toBe(true);
    expect(high.root.getObjectByName("MO_Terrain")?.castShadow).toBe(true);
    expect(
      named(high.root, "MoonFloodMast-")[0]?.getObjectByProperty("type", "Mesh")
        ?.castShadow
    ).toBe(true);
    // Only one light ever casts.
    const casters: Object3D[] = [];
    high.root.traverse((object) => {
      if ((object as DirectionalLight).isLight && object.castShadow)
        casters.push(object);
    });
    expect(casters).toHaveLength(1);
    high.dispose();

    const low = await createCosmicEnvironmentWorld(
      options({ qualityTier: "low" })
    );
    expect(
      (low.root.getObjectByName("MoonSunLight") as DirectionalLight).castShadow
    ).toBe(false);
    expect(low.root.getObjectByName("MO_Terrain")?.castShadow).toBe(false);
    low.dispose();
  });

  it("grows the pad with the stage radius and keeps the outpost pieces outside it", async () => {
    const config = createDefaultCosmicNightConfig();
    const setup = options({ config, stageRadius: 8 });
    const authored = setup.assets!.authoredScene;
    const terrain = authored.getObjectByName("MO_Terrain")!;
    const template = authored.getObjectByName("MO_TemplateFloodMast")!;
    const world = await createCosmicEnvironmentWorld(setup);
    await world.audienceReady;

    expect(world.platformExpanded).toBe(true);
    expect(world.config.platform.radius).toBe(8);
    expect(terrain.visible).toBe(true);
    expect(template.visible).toBe(false);
    const padRadius = padPaintedRadius(world.root);
    expect(padRadius).toBeCloseTo(10, 5);
    for (const mast of named(world.root, "MoonFloodMast-")) {
      expect(horizontalDistance(mast)).toBeGreaterThan(padRadius);
    }
    for (const bench of named(world.root, "MoonBench-")) {
      expect(horizontalDistance(bench)).toBeGreaterThan(padRadius);
    }
    for (const seat of named(world.root, "CosmicAudienceSeat-")) {
      expect(horizontalDistance(seat)).toBeGreaterThan(padRadius);
    }

    world.dispose();
    expect(template.visible).toBe(true);
  });

  it("regrows the pad live for a larger cast and moves benches and seats with it", async () => {
    const world = await createCosmicEnvironmentWorld(options());
    await world.audienceReady;
    const smallPad = padPaintedRadius(world.root);
    const bench = named(world.root, "MoonBench-")[4]!;
    const seat = named(world.root, "CosmicAudienceSeat-")[4]!;
    const mast = named(world.root, "MoonFloodMast-")[0]!;
    const before = {
      bench: horizontalDistance(bench),
      seat: horizontalDistance(seat),
      mast: horizontalDistance(mast),
    };
    expect(seat.position.x).toBeCloseTo(bench.position.x, 6);
    expect(seat.position.z).toBeCloseTo(bench.position.z, 6);

    world.setStageBounds(7, 0);
    expect(world.platformExpanded).toBe(true);
    expect(padPaintedRadius(world.root)).toBeGreaterThan(smallPad + 3);
    expect(horizontalDistance(bench)).toBeGreaterThan(before.bench + 3);
    expect(horizontalDistance(seat)).toBeGreaterThan(before.seat + 3);
    expect(horizontalDistance(mast)).toBeGreaterThan(before.mast + 3);
    // Every seat still sits on its own bench.
    expect(seat.position.x).toBeCloseTo(bench.position.x, 6);
    expect(seat.position.z).toBeCloseTo(bench.position.z, 6);

    world.dispose();
  });

  it("aims the floods at the upper body and keeps the performer's feet out of them", async () => {
    // Unshadowed flood light on the ground fills in the sun shadow at the
    // performer's soles, which makes them read as floating.
    const world = await createCosmicEnvironmentWorld(options());
    const inCone = (flood: SpotLight, point: Vector3) => {
      const axis = flood.target.position.clone().sub(flood.position).normalize();
      const toPoint = point.clone().sub(flood.position).normalize();
      return Math.acos(Math.min(1, axis.dot(toPoint))) < flood.angle;
    };
    for (const radius of [3, 7]) {
      world.setStageBounds(radius, 0);
      const floods = named(world.root, "MoonFloodLight-") as SpotLight[];
      expect(floods).toHaveLength(3);
      for (const flood of floods) {
        expect(inCone(flood, new Vector3(0, MOON_APRON_HEIGHT, 0))).toBe(false);
        expect(inCone(flood, new Vector3(0, MOON_APRON_HEIGHT + 1.4, 0))).toBe(true);
        // The beam dies out soon after the performer instead of pooling beyond.
        expect(flood.distance).toBeLessThan(flood.position.distanceTo(flood.target.position) * 1.5);
      }
    }
    world.dispose();
  });

  it("ends the tracks and bootprints at the pad's edge as the pad grows", async () => {
    const world = await createCosmicEnvironmentWorld(options());
    const padRadiusOf = (owner: string) => {
      const mesh = world.root.getObjectByName(owner)!;
      const material = (mesh as Mesh).material as MeshStandardMaterial;
      return (material.userData.padRadius as { value: number }).value;
    };
    const small = padPaintedRadius(world.root);
    expect(padRadiusOf("MO_RoverTracks")).toBeCloseTo(small, 6);
    expect(padRadiusOf("MO_Bootprints")).toBeCloseTo(small, 6);
    world.setStageBounds(7, 0);
    const grown = padPaintedRadius(world.root);
    expect(grown).toBeGreaterThan(small + 3);
    expect(padRadiusOf("MO_RoverTracks")).toBeCloseTo(grown, 6);
    expect(padRadiusOf("MO_Bootprints")).toBeCloseTo(grown, 6);
    world.dispose();
  });

  it("hangs a large Earth clear of the horizon hills", async () => {
    const world = await createCosmicEnvironmentWorld(options());
    const earth = world.root.getObjectByName("MoonEarth")!;
    const surface = earth.getObjectByName("MoonEarthSurface") as Mesh;
    surface.geometry.computeBoundingSphere();
    const distance = earth.position.length();
    const angularRadius = Math.asin(surface.geometry.boundingSphere!.radius / distance);
    const elevation = Math.asin(earth.position.y / distance);
    const degrees = (radians: number) => (radians * 180) / Math.PI;
    // About two and a half times the first pass's 6.5 degrees across.
    expect(degrees(angularRadius * 2)).toBeGreaterThan(14);
    // Its lower limb stands above the hill line (about 6 degrees up).
    expect(degrees(elevation - angularRadius)).toBeGreaterThan(6);
    world.dispose();
  });

  it("moves every grounded part with setGroundY and keeps the sky on the camera", async () => {
    const world = await createCosmicEnvironmentWorld(options());
    await world.audienceReady;
    const camera = new PerspectiveCamera();
    camera.position.set(4, 5, 6);
    world.update(0.5, 0.5, camera);
    for (const name of ["MoonSky", "MoonStars", "MoonOrbiter"]) {
      expect(world.root.getObjectByName(name)?.position.toArray()).toEqual([4, 5, 6]);
    }

    const grounded = [
      "MO_Terrain",
      "MO_Habitat",
      "MoonPadSurface",
      "MoonPadLights",
      "MoonFloodMast-0",
      "MoonFloodLight-0",
      "MoonCargo-0",
      "MoonBench-0",
      "MoonSunLight",
      "MoonAirlockLight",
      "CosmicAudienceSeat-0",
    ];
    const worldY = (name: string) => {
      world.root.updateMatrixWorld(true);
      return world.root.getObjectByName(name)!.getWorldPosition(new Vector3()).y;
    };
    const before = grounded.map(worldY);
    world.setGroundY(2.25);
    const after = grounded.map(worldY);
    grounded.forEach((name, index) => {
      expect({ name, moved: after[index]! - before[index]! }).toEqual({
        name,
        moved: expect.closeTo(3.75, 6),
      });
    });
    expect(world.root.getObjectByName("CosmicSeatedAudience")?.position.y).toBeCloseTo(
      2.25 + MOON_APRON_HEIGHT,
      6
    );

    world.dispose();
  });

  it("turns the Earth and runs the lights only while motion is on", async () => {
    const moving = await createCosmicEnvironmentWorld(options());
    const camera = new PerspectiveCamera();
    const earth = moving.root.getObjectByName("MoonEarthSurface")!;
    const lights = moving.root.getObjectByName("MoonPadLights") as InstancedMesh;
    const beacon = moving.root
      .getObjectByName("MO_CommsMast_beacon") as Mesh;
    const beaconMaterial = beacon.material as MeshStandardMaterial;
    const before = earth.rotation.y;
    const levels = new Set<number>();
    for (let step = 0; step < 40; step += 1) {
      moving.update(0.25, step * 0.25, camera);
      levels.add(Math.round(beaconMaterial.emissiveIntensity * 100));
    }
    expect(earth.rotation.y).toBeGreaterThan(before);
    expect(levels.size).toBeGreaterThan(1);
    expect(lights.instanceColor).not.toBeNull();
    moving.dispose();

    const still = await createCosmicEnvironmentWorld(options({ motionScale: 0 }));
    const stillEarth = still.root.getObjectByName("MoonEarthSurface")!;
    const stillBeacon = (still.root.getObjectByName("MO_CommsMast_beacon") as Mesh)
      .material as MeshStandardMaterial;
    const stillLevels = new Set<number>();
    for (let step = 0; step < 40; step += 1) {
      still.update(0.25, step * 0.25, camera);
      stillLevels.add(Math.round(stillBeacon.emissiveIntensity * 100));
    }
    expect(stillEarth.rotation.y).toBe(0);
    expect(stillLevels.size).toBe(1);
    expect(still.root.getObjectByName("MoonOrbiter")?.visible).toBe(false);
    still.dispose();
  });

  it("frees what it made and hands the cached model back as it found it", async () => {
    const setup = options();
    const authored = setup.assets!.authoredScene;
    const terrain = authored.getObjectByName("MO_Terrain") as Mesh;
    const beacon = authored.getObjectByName("MO_CommsMast_beacon") as Mesh;
    const originalTerrain = terrain.material;
    const originalBeacon = beacon.material;
    const world = await createCosmicEnvironmentWorld(setup);
    await world.audienceReady;

    expect(terrain.material).not.toBe(originalTerrain);
    expect(beacon.material).not.toBe(originalBeacon);
    const madeMaterials = [
      terrain.material as MeshStandardMaterial,
      beacon.material as MeshStandardMaterial,
      (world.root.getObjectByName("MoonSkySphere") as Mesh).material as ShaderMaterial,
      (world.root.getObjectByName("MoonEarthSurface") as Mesh).material as ShaderMaterial,
      (world.root.getObjectByName("MoonPadSurface") as Mesh).material as MeshStandardMaterial,
    ];
    const madeGeometries = [
      (world.root.getObjectByName("MoonSkySphere") as Mesh).geometry,
      (world.root.getObjectByName("MoonStarPoints") as Mesh).geometry,
      (world.root.getObjectByName("MoonEarthSurface") as Mesh).geometry,
      (world.root.getObjectByName("MoonPadSurface") as Mesh).geometry,
    ];
    const sun = world.root.getObjectByName("MoonSunLight") as DirectionalLight;
    const spies = [
      ...madeMaterials.map((material) => vi.spyOn(material, "dispose")),
      ...madeGeometries.map((geometry) => vi.spyOn(geometry, "dispose")),
      vi.spyOn(sun, "dispose"),
    ];
    const cachedGeometry = vi.spyOn(terrain.geometry, "dispose");
    const cachedMaterial = vi.spyOn(originalTerrain as MeshStandardMaterial, "dispose");

    world.dispose();

    for (const spy of spies) expect(spy).toHaveBeenCalled();
    // The cached model is not the world's to free.
    expect(cachedGeometry).not.toHaveBeenCalled();
    expect(cachedMaterial).not.toHaveBeenCalled();
    expect(terrain.material).toBe(originalTerrain);
    expect(beacon.material).toBe(originalBeacon);
    expect(authored.parent).toBeNull();
    expect(world.root.children).toHaveLength(0);
  });

  it("does not attach an audience that finishes after the world was disposed", async () => {
    let release!: () => void;
    const loader: CosmicAudienceLoader = {
      preloadAll: () => new Promise<void>((resolve) => (release = resolve)),
      prepareFigure: async () => ({ scene: new Group(), clip: null }),
    };
    const world = await createCosmicEnvironmentWorld(
      options({ audienceLoader: loader })
    );
    world.dispose();
    release();
    await world.audienceReady;

    expect(world.root.getObjectByName("CosmicSeatedAudience")).toBeUndefined();
    expect(world.root.children).toHaveLength(0);
  });

  it("matches production audience readiness and concurrent figure preparation", async () => {
    let releaseFigure!: () => void;
    const pendingFigure = new Promise<void>((resolve) => {
      releaseFigure = resolve;
    });
    let inFlight = 0;
    let peakInFlight = 0;
    const loader: CosmicAudienceLoader = {
      preloadAll: vi.fn(async () => undefined),
      prepareFigure: vi.fn(async () => {
        inFlight += 1;
        peakInFlight = Math.max(peakInFlight, inFlight);
        await pendingFigure;
        inFlight -= 1;
        return { scene: new Group(), clip: null };
      }),
    };
    const onAudienceReady = vi.fn();
    const world = await createCosmicEnvironmentWorld(
      options({ audienceLoader: loader, onAudienceReady })
    );
    await Promise.resolve();

    expect(onAudienceReady).toHaveBeenCalledOnce();
    expect(loader.prepareFigure).toHaveBeenCalledTimes(9);
    expect(peakInFlight).toBe(9);
    expect(world.root.getObjectByName("CosmicSeatedAudience")).toBeUndefined();

    releaseFigure();
    await world.audienceReady;
    expect(world.root.getObjectByName("CosmicSeatedAudience")).toBeDefined();
    world.dispose();
  });

  it("prepares a finished audience before it joins the world", async () => {
    let releasePreparation!: () => void;
    const prepareAudience = vi.fn(
      () => new Promise<void>((resolve) => (releasePreparation = resolve))
    );
    const world = await createCosmicEnvironmentWorld(
      options({ prepareAudience })
    );
    await vi.waitFor(() => expect(prepareAudience).toHaveBeenCalledOnce());

    const [audience] = prepareAudience.mock.calls[0] as unknown as [Group];
    expect(audience.name).toBe("CosmicSeatedAudience");
    expect(world.root.getObjectByName("CosmicSeatedAudience")).toBeUndefined();

    releasePreparation();
    await world.audienceReady;
    expect(world.root.getObjectByName("CosmicSeatedAudience")).toBe(audience);
    world.dispose();
  });

  it("still seats the audience when its preparation fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const world = await createCosmicEnvironmentWorld(
      options({
        prepareAudience: async () => Promise.reject(new Error("lost")),
      })
    );
    await world.audienceReady;

    expect(world.root.getObjectByName("CosmicSeatedAudience")).toBeDefined();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
    world.dispose();
  });

  it("holds the audience's loading until its gate opens", async () => {
    let openGate!: () => void;
    const audienceGate = new Promise<void>((resolve) => (openGate = resolve));
    const loader = audienceLoader();
    const world = await createCosmicEnvironmentWorld(
      options({ audienceLoader: loader, audienceGate })
    );
    await Promise.resolve();
    expect(loader.preloadAll).not.toHaveBeenCalled();

    openGate();
    await world.audienceReady;
    expect(loader.preloadAll).toHaveBeenCalledOnce();
    expect(world.root.getObjectByName("CosmicSeatedAudience")).toBeDefined();
    world.dispose();
  });
});
