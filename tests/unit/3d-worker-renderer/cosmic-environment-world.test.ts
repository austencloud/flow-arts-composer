import { describe, expect, it, vi } from "vitest";
import {
  Group,
  PerspectiveCamera,
  Texture,
  Vector2,
  type WebGLRenderer,
} from "three";
import { createDefaultCosmicNightConfig } from "$lib/shared/3d/environments/domain/models/scene-configs";
import {
  createCosmicEnvironmentWorld,
  type CosmicEnvironmentWorldOptions,
} from "$lib/shared/3d/environments/worlds/cosmic/cosmic-environment-world";
import type { CosmicAudienceLoader } from "$lib/shared/3d/environments/worlds/cosmic/cosmic-audience";

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

function options(
  overrides: Partial<CosmicEnvironmentWorldOptions> = {}
): CosmicEnvironmentWorldOptions {
  const authoredScene = new Group();
  const terrain = new Group();
  terrain.name = "AR_Terrain";
  const mechanism = new Group();
  mechanism.name = "AR_Orrery";
  authoredScene.add(terrain, mechanism);
  return {
    renderer: renderer(),
    groundY: -1.5,
    assets: {
      authoredScene,
      earthTexture: new Texture(),
      moonTexture: new Texture(),
    },
    audienceLoader: audienceLoader(),
    random: () => 0.25,
    ...overrides,
  };
}

describe("createCosmicEnvironmentWorld", () => {
  it("builds the complete default production graph and nine-seat audience", async () => {
    const loader = audienceLoader();
    const world = await createCosmicEnvironmentWorld(
      options({ audienceLoader: loader })
    );
    await world.audienceReady;

    expect(world.root.children.map((child) => child.name)).toEqual([
      "CosmicSkyGradient",
      "CosmicNebula",
      "CosmicReliquaryRoot",
      "CosmicStationPlatform",
      "CosmicEarth",
      "CosmicWarmStationLight",
      "CosmicColdDirectionalLight",
      "CosmicHemisphereLight",
      "CosmicStarfield",
      "CosmicEarthGodRays",
      "CosmicDust",
      "CosmicEnergyParticles",
      "CosmicMeteorStreaks",
      "CosmicSeatedAudience",
    ]);
    expect(
      world.root.getObjectByName("CosmicMeteorStreaks")?.children
    ).toHaveLength(5);
    expect(
      world.root.getObjectByName("CosmicSeatedAudience")?.children
    ).toHaveLength(9);
    expect(loader.preloadAll).toHaveBeenCalledOnce();
    expect(loader.prepareFigure).toHaveBeenCalledTimes(9);
    expect(
      world.root.getObjectByName("CosmicPlatformAccentLight-0")
    ).toBeUndefined();
    expect(world.platformExpanded).toBe(false);

    world.dispose();
  });

  it("expands the safety deck, hides only the authored mechanism, and restores it on dispose", async () => {
    const config = createDefaultCosmicNightConfig();
    const setup = options({ config, stageRadius: 8 });
    const authored = setup.assets!.authoredScene;
    const terrain = authored.getObjectByName("AR_Terrain")!;
    const mechanism = authored.getObjectByName("AR_Orrery")!;
    const world = await createCosmicEnvironmentWorld(setup);

    expect(world.platformExpanded).toBe(true);
    expect(world.config.platform.radius).toBe(8);
    expect(terrain.visible).toBe(true);
    expect(mechanism.visible).toBe(false);
    expect(
      world.root.getObjectByName("CosmicPlatformAccentLight-0")
    ).toBeDefined();
    expect(
      world.root.getObjectByName("CosmicPlatformAccentLight-7")
    ).toBeDefined();

    world.dispose();
    expect(mechanism.visible).toBe(true);
  });

  it("advances every animated owner and follows the live camera and ground", async () => {
    const world = await createCosmicEnvironmentWorld(options());
    const camera = new PerspectiveCamera();
    camera.position.set(4, 5, 6);
    const earth = world.root.getObjectByName("CosmicEarthSurface")!;
    const beforeRotation = earth.rotation.y;

    world.update(0.5, 0.5, camera);
    expect(
      world.root.getObjectByName("CosmicSkyGradient")?.position.toArray()
    ).toEqual([4, 5, 6]);
    expect(earth.rotation.y).toBeGreaterThan(beforeRotation);

    world.setGroundY(2.25);
    expect(world.root.getObjectByName("CosmicReliquaryRoot")?.position.y).toBe(
      2.25
    );
    expect(
      world.root.getObjectByName("CosmicStationPlatform")?.position.y
    ).toBe(2.25);
    expect(
      world.root.getObjectByName("CosmicEnergyParticles")?.position.y
    ).toBe(2.25);

    world.dispose();
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
