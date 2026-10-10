import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Scene,
  Texture,
  WebGLRenderTarget,
} from "three";
import { describe, expect, it, vi } from "vitest";
import { warmWorkerRenderer } from "#lib/shared/3d/worker-renderer/services/worker-renderer-warmup.js";
import {
  prepareLateWorkerObject,
  primeWorkerRenderer,
  WORKER_PRIME_BATCH_SIZE,
} from "#lib/shared/3d/worker-renderer/services/worker-renderer-warmup.js";

describe("worker renderer warm-up", () => {
  it("dispatches every distinct program before awaiting driver completion", async () => {
    const scene = new Scene();
    const shared = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    const duplicate = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    const distinct = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    scene.add(shared, duplicate, distinct);
    const releases: Array<() => void> = [];
    const compileAsync = vi.fn(
      () => new Promise<void>((resolve) => releases.push(resolve))
    );
    const yieldBetween = vi.fn(async () => undefined);
    const progress: number[] = [];

    const warming = warmWorkerRenderer(
      {
        renderer: { compileAsync } as never,
        scene,
        camera: {} as never,
      },
      {
        yieldBetween,
        onProgress: (fraction) => progress.push(fraction),
      }
    );

    await vi.waitFor(() => expect(compileAsync).toHaveBeenCalledTimes(2));
    expect(compileAsync.mock.calls.map(([target]) => target)).toEqual([
      shared,
      distinct,
    ]);
    expect(yieldBetween).toHaveBeenCalledTimes(1);
    expect(progress).toEqual([]);
    for (const release of releases) release();
    const metrics = await warming;
    expect(progress).toEqual([0.5, 1]);
    expect(metrics.map(({ label }) => label)).toEqual([
      "MeshBasicMaterial",
      "MeshStandardMaterial",
    ]);
    expect(metrics.every(({ durationMs }) => durationMs >= 0)).toBe(true);
  });

  it("restores a hidden target after its program is prepared", async () => {
    const scene = new Scene();
    const hidden = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    hidden.visible = false;
    scene.add(hidden);

    await warmWorkerRenderer({
      renderer: { compileAsync: vi.fn(async () => undefined) } as never,
      scene,
      camera: {} as never,
    });

    expect(hidden.visible).toBe(false);
  });

  it("primes bounded batches per turn and restores the complete scene", async () => {
    const scene = new Scene();
    const meshes = Array.from(
      { length: WORKER_PRIME_BATCH_SIZE + 2 },
      (_, index) => {
        const mesh = new Mesh(
          new BoxGeometry(),
          index % 2 === 0 ? new MeshBasicMaterial() : new MeshStandardMaterial()
        );
        mesh.name = `mesh-${index}`;
        return mesh;
      }
    );
    scene.add(...meshes);
    const visiblePerDraw: string[][] = [];
    const render = vi.fn(() => {
      const visible: string[] = [];
      scene.traverseVisible((object) => {
        if ((object as Mesh).isMesh) visible.push(object.name);
      });
      visiblePerDraw.push(visible);
    });
    const yieldBetween = vi.fn(async () => undefined);

    const count = await primeWorkerRenderer(
      {
        renderer: { render } as never,
        scene,
        camera: {} as never,
      },
      { yieldBetween }
    );

    expect(count).toBe(meshes.length);
    expect(visiblePerDraw).toEqual([
      meshes.slice(0, WORKER_PRIME_BATCH_SIZE).map(({ name }) => name),
      meshes.slice(WORKER_PRIME_BATCH_SIZE).map(({ name }) => name),
    ]);
    expect(yieldBetween).toHaveBeenCalledTimes(1);
    expect(meshes.every(({ visible }) => visible)).toBe(true);
  });

  it("compiles a late object against the scene's render target and uploads its textures", async () => {
    const scene = new Scene();
    const sceneTarget = new WebGLRenderTarget(4, 4);
    const map = new Texture();
    const normalMap = new Texture();
    const late = new Group();
    late.add(
      new Mesh(new BoxGeometry(), new MeshStandardMaterial({ map, normalMap })),
      new Mesh(new BoxGeometry(), new MeshStandardMaterial({ map }))
    );
    let bound: WebGLRenderTarget | null = null;
    const boundDuringCompile: Array<WebGLRenderTarget | null> = [];
    let release!: () => void;
    const renderer = {
      getRenderTarget: () => bound,
      setRenderTarget: (target: WebGLRenderTarget | null) => {
        bound = target;
      },
      compileAsync: vi.fn(() => {
        boundDuringCompile.push(bound);
        return new Promise<void>((resolve) => (release = resolve));
      }),
      initTexture: vi.fn(),
    };

    let settled = false;
    const preparing = prepareLateWorkerObject(
      { renderer: renderer as never, scene, camera: {} as never },
      late,
      sceneTarget
    ).then(() => (settled = true));

    expect(renderer.compileAsync).toHaveBeenCalledWith(late, {}, scene);
    expect(boundDuringCompile).toEqual([sceneTarget]);
    // The live binding is back before the driver finishes linking.
    expect(bound).toBeNull();
    expect(renderer.initTexture.mock.calls.map(([texture]) => texture)).toEqual(
      [map, normalMap]
    );
    await Promise.resolve();
    expect(settled).toBe(false);

    release();
    await preparing;
    expect(settled).toBe(true);
  });
});
