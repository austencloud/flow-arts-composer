import { beforeEach, describe, expect, it, vi } from "vitest";
import { FogExp2, Group, PerspectiveCamera, type WebGLRenderer } from "three";

const factory = vi.hoisted(() => vi.fn());

vi.mock(
  "$lib/shared/3d/environments/worlds/cosmic/cosmic-environment-world",
  () => ({ createCosmicEnvironmentWorld: factory })
);

import { getWorkerEnvironmentCamera } from "$lib/shared/3d/worker-renderer/domain/worker-environment-camera";
import { createCosmicPrototypeWorld } from "$lib/shared/3d/worker-renderer/worlds/cosmic-prototype-world";

describe("createCosmicPrototypeWorld", () => {
  beforeEach(() => {
    factory.mockReset();
  });

  it("keeps worker concerns outside the shared production world", async () => {
    const root = new Group();
    const fog = new FogExp2("#080818", 0.008);
    const update = vi.fn();
    const setGroundY = vi.fn();
    const dispose = vi.fn();
    factory.mockImplementation(async (options) => {
      options.onAssetProgress(0.6);
      return {
        root,
        fog,
        audienceReady: Promise.resolve(),
        update,
        setGroundY,
        dispose,
      };
    });
    const reportProgress = vi.fn();
    const camera = new PerspectiveCamera();
    const renderer = {} as WebGLRenderer;
    const world = await createCosmicPrototypeWorld({
      renderer,
      camera,
      requestId: 3,
      performers: [{ groundY: -1.25 } as never],
      reportProgress,
    });

    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({ renderer, groundY: -1.25, stageRadius: 3 })
    );
    expect(world.environment).toBe("cosmic");
    expect(world.useViewerBaseLighting).toBe(false);
    expect(world.scene.children).toContain(root);
    expect(world.scene.fog).toBe(fog);
    expect(reportProgress).toHaveBeenCalledWith("assets", 0.6);
    expect(reportProgress).toHaveBeenLastCalledWith("construct", 1);

    world.update(0.25, 2);
    expect(update).toHaveBeenCalledWith(0.25, 2, camera);
    world.setPerformers?.([{ groundY: 1.5 } as never]);
    expect(setGroundY).toHaveBeenCalledWith(1.5);

    world.dispose();
    expect(dispose).toHaveBeenCalledOnce();
    expect(world.scene.children).not.toContain(root);
    expect(world.scene.fog).toBeNull();
  });

  it("pins the same initial framing used by the production viewer", () => {
    expect(getWorkerEnvironmentCamera("cosmic")).toEqual({
      position: [0, 4.2, 17],
      target: [0, 1.1, -1],
      fov: 48,
    });
  });

  it("opens without waiting for the seated audience and readies it in place", async () => {
    let worldOptions!: {
      audienceGate?: Promise<void>;
      prepareAudience?: (audience: Group) => Promise<void>;
    };
    factory.mockImplementation(async (options) => {
      worldOptions = options;
      return {
        root: new Group(),
        fog: new FogExp2("#080818", 0.008),
        audienceReady: new Promise<void>(() => undefined),
        update: vi.fn(),
        setGroundY: vi.fn(),
        dispose: vi.fn(),
      };
    });
    const reportProgress = vi.fn();
    const prepareLateObject = vi.fn(async () => undefined);
    const scenePresented = new Promise<void>(() => undefined);

    const world = await createCosmicPrototypeWorld({
      renderer: {} as WebGLRenderer,
      camera: new PerspectiveCamera(),
      requestId: 4,
      performers: [],
      reportProgress,
      scenePresented,
      prepareLateObject,
    });

    expect(reportProgress).toHaveBeenLastCalledWith("construct", 1);
    expect(worldOptions.audienceGate).toBe(scenePresented);
    const audience = new Group();
    await worldOptions.prepareAudience?.(audience);
    expect(prepareLateObject).toHaveBeenCalledWith(audience, world.scene);
  });
});
