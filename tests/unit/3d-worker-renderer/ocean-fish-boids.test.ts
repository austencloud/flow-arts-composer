import {
  BufferGeometry,
  InstancedMesh,
  PerspectiveCamera,
  ShaderMaterial,
  Texture,
  Vector3,
  type WebGLRenderer,
} from "three";
import { describe, expect, it, vi } from "vitest";
import {
  createOceanFishBoids,
  type OceanFishBoidsDependencies,
} from "#lib/shared/3d/environments/worlds/ocean/ocean-fish-boids.js";
import type { FishComputeSystem } from "#lib/shared/3d/environments/scenes/ocean/runtime/fauna/fish/fish-compute.js";
import type {
  ExtractedModel,
  FishRenderSystem,
} from "#lib/shared/3d/environments/scenes/ocean/runtime/fauna/fish/fish-render.js";
import {
  RESIDENT_SPECIES,
  VISITOR_SPECIES,
  type FishSpeciesConfig,
  type VisitorGroup,
} from "#lib/shared/3d/environments/scenes/ocean/runtime/fauna/fish/fish-species.js";

function createFishMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      tPosition: { value: null },
      tVelocity: { value: null },
      tState: { value: null },
      uTime: { value: 0 },
      uSize: { value: 1 },
      uWorldOffset: { value: new Vector3() },
      uFogColor: { value: { set: vi.fn() } },
      uFogNear: { value: 0 },
      uFogFar: { value: 0 },
      uAmbient: { value: 0 },
    },
  });
}

function createFishMesh(material = createFishMaterial()): InstancedMesh {
  return new InstancedMesh(new BufferGeometry(), material, 1);
}

function createComputeSystem(): FishComputeSystem {
  return {
    positionTexture: new Texture(),
    velocityTexture: new Texture(),
    stateTexture: new Texture(),
    texSize: 14,
    loadedSpeciesCount: 1,
    residentFishCount: 1,
    eventSystem: null,
    velVar: {
      material: {
        uniforms: {
          uSpawnCount: { value: 0 },
          uGroundY: { value: 0 },
        },
      },
    },
    stateVar: { material: { uniforms: {} } },
    posVar: {
      material: {
        uniforms: {
          uSpawnCount: { value: 0 },
          uDespawnCount: { value: 0 },
          uFloorY: { value: 0 },
          uCeilingY: { value: 0 },
        },
      },
    },
    gpuCompute: null,
    storedTraitsData: null,
    update: vi.fn(),
    processSpawn: vi.fn(),
    processDespawn: vi.fn(),
    dispose: vi.fn(),
  };
}

interface RenderHarness {
  system: FishRenderSystem;
  residentMesh: InstancedMesh;
  visitorMesh: InstancedMesh;
  fallbackMesh: InstancedMesh;
}

function createRenderHarness(
  loadModels?: FishRenderSystem["loadModels"]
): RenderHarness {
  const residentMesh = createFishMesh();
  const visitorMesh = createFishMesh();
  const fallbackMesh = createFishMesh();
  const model: ExtractedModel = {
    geometry: new BufferGeometry(),
    diffuseMap: null,
  };

  const meshes: InstancedMesh[] = [];
  const materials: ShaderMaterial[] = [];
  const materialSizeMults: number[] = [];
  const system = {
    meshes,
    materials,
    materialSizeMults,
    loadModels:
      loadModels ??
      vi.fn(async (species) =>
        species.map((fishSpecies: FishSpeciesConfig) => ({
          species: fishSpecies,
          model,
        }))
      ),
    createResidentMeshes: vi.fn(() => {
      meshes.push(residentMesh);
      materials.push(residentMesh.material as ShaderMaterial);
      materialSizeMults.push(1);
    }),
    createVisitorMesh: vi.fn(() => ({
      mesh: visitorMesh,
      material: visitorMesh.material as ShaderMaterial,
    })),
    updateTextures: vi.fn(),
    createCPUFallback: vi.fn(() => [fallbackMesh]),
    dispose: vi.fn(),
  } as unknown as FishRenderSystem;

  return { system, residentMesh, visitorMesh, fallbackMesh };
}

function createRotationController() {
  return {
    activeGroups: [] as VisitorGroup[],
    tick: vi.fn<(_: number) => VisitorGroup | null>(() => null),
  };
}

function createDependencies(
  renderSystem: FishRenderSystem,
  computeSystem: FishComputeSystem | null,
  rotationController = createRotationController()
): Partial<OceanFishBoidsDependencies> {
  return {
    createRenderSystem: vi.fn(() => renderSystem),
    createComputeSystem: vi.fn(() => computeSystem),
    createRotationManager: vi.fn(() => rotationController),
    random: vi.fn(() => 0.5),
  };
}

const renderer = {} as WebGLRenderer;

describe("createOceanFishBoids", () => {
  it("owns GPU lifecycle, world-local cursor input, and live placement", async () => {
    const render = createRenderHarness();
    const compute = createComputeSystem();
    const dependencies = createDependencies(render.system, compute);
    const world = createOceanFishBoids(
      {
        renderer,
        groundY: -1,
        worldOffset: [4, -2, 7],
        fogColor: "#123456",
        fogNear: 10,
        fogFar: 30,
        ambient: 0.8,
      },
      dependencies
    );

    expect(world.mode).toBe("loading");
    expect(world.isReady).toBe(false);
    expect(world.root).toBe(world.object);
    await world.ready;

    expect(world.mode).toBe("gpu");
    expect(world.isReady).toBe(true);
    expect(world.object.children).toEqual([render.residentMesh]);
    expect(
      (
        render.residentMesh.material as ShaderMaterial
      ).uniforms.uWorldOffset!.value.toArray()
    ).toEqual([4, -2, 7]);

    world.setGroundY(-3);
    expect(compute.velVar.material.uniforms.uGroundY.value).toBe(-3);
    expect(compute.posVar.material.uniforms.uFloorY.value).toBe(-2.4);
    expect(compute.posVar.material.uniforms.uCeilingY.value).toBe(5.5);

    world.setCursorRay({
      origin: new Vector3(10, 6, 2),
      dir: new Vector3(0, 0, -1),
      active: true,
    });
    const camera = new PerspectiveCamera();
    camera.updateMatrixWorld(true);
    world.update(0.1, camera);

    expect(compute.update).toHaveBeenCalledOnce();
    const frame = vi.mocked(compute.update).mock.calls[0]![0];
    expect(frame.delta).toBe(0.05);
    expect(frame.time).toBe(0.05);
    expect(frame.groundY).toBe(-3);
    expect(frame.cursorRayOrigin.toArray()).toEqual([6, 8, -5]);
    expect(frame.cursorRayDir.toArray()).toEqual([0, 0, -1]);
    expect(frame.cursorActive).toBe(true);
    expect(frame.cameraRight.toArray()).toEqual([1, 0, 0]);
    expect(render.system.updateTextures).toHaveBeenCalledWith(
      compute.positionTexture,
      compute.velocityTexture,
      compute.stateTexture,
      0.05,
      1
    );

    world.dispose();
    world.dispose();
    expect(compute.dispose).toHaveBeenCalledOnce();
    expect(render.system.dispose).toHaveBeenCalledOnce();
    expect(world.mode).toBe("disposed");
    expect(world.object.children).toHaveLength(0);
  });

  it("keeps an animated CPU fallback when GPGPU setup fails", async () => {
    const render = createRenderHarness();
    const world = createOceanFishBoids(
      {
        renderer,
        groundY: -2,
        worldOffset: [1, 2, 3],
      },
      createDependencies(render.system, null)
    );
    const fallbackMaterial = render.fallbackMesh.material as ShaderMaterial;
    const materialDispose = vi.spyOn(fallbackMaterial, "dispose");
    const geometryDispose = vi.spyOn(render.fallbackMesh.geometry, "dispose");

    await world.ready;
    expect(world.mode).toBe("cpu");
    expect(world.object.children).toEqual([render.fallbackMesh]);
    expect(fallbackMaterial.uniforms.uWorldOffset!.value.toArray()).toEqual([
      1, 2, 3,
    ]);

    world.setGroundY(-4);
    const matrixVersion = render.fallbackMesh.instanceMatrix.version;
    world.update(0.25, new PerspectiveCamera());
    expect(fallbackMaterial.uniforms.uTime!.value).toBe(0.25);
    expect(render.fallbackMesh.instanceMatrix.version).toBeGreaterThan(
      matrixVersion
    );

    world.dispose();
    world.dispose();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(render.system.dispose).toHaveBeenCalledOnce();
  });

  it("preserves visitor spawn, mount, and despawn sequencing", async () => {
    const visitorSpecies = VISITOR_SPECIES.find(
      (species) => species.name === "Great Barracuda"
    )!;
    const visitorGroup: VisitorGroup = {
      species: [visitorSpecies],
      slots: { startIndex: 1, count: 1 },
      remainingTime: 30,
      entryAngle: 0,
      exitAngle: Math.PI,
    };
    const model: ExtractedModel = {
      geometry: new BufferGeometry(),
      diffuseMap: null,
    };
    const loadModels = vi.fn(async (species: FishSpeciesConfig[]) =>
      species.map((fishSpecies) => ({ species: fishSpecies, model }))
    );
    const render = createRenderHarness(loadModels);
    const compute = createComputeSystem();
    const rotation = createRotationController();
    let tickCount = 0;
    rotation.tick.mockImplementation(() => {
      tickCount++;
      if (tickCount === 1) {
        rotation.activeGroups = [visitorGroup];
        return visitorGroup;
      }
      if (tickCount === 2) rotation.activeGroups = [];
      return null;
    });
    const visitorMaterial = render.visitorMesh.material as ShaderMaterial;
    const visitorMaterialDispose = vi.spyOn(visitorMaterial, "dispose");
    const visitorGeometryDispose = vi.spyOn(
      render.visitorMesh.geometry,
      "dispose"
    );
    const world = createOceanFishBoids(
      { renderer },
      createDependencies(render.system, compute, rotation)
    );
    const camera = new PerspectiveCamera();

    await world.ready;
    world.update(0.016, camera);
    await Promise.resolve();
    expect(world.object.children).toEqual([
      render.residentMesh,
      render.visitorMesh,
    ]);

    world.update(0.016, camera);
    expect(compute.processSpawn).toHaveBeenCalledOnce();
    expect(world.object.children).toEqual([render.residentMesh]);
    expect(render.system.materials).toHaveLength(1);
    expect(render.system.materialSizeMults).toHaveLength(1);

    world.update(0.016, camera);
    expect(compute.processDespawn).toHaveBeenCalledWith(1, 1);
    expect(visitorMaterialDispose).toHaveBeenCalledOnce();
    expect(visitorGeometryDispose).toHaveBeenCalledOnce();
    world.dispose();
  });

  it("does not resurrect fish after disposal while models are loading", async () => {
    let resolveModels!: (
      results: Awaited<ReturnType<FishRenderSystem["loadModels"]>>
    ) => void;
    const pendingModels = new Promise<
      Awaited<ReturnType<FishRenderSystem["loadModels"]>>
    >((resolve) => {
      resolveModels = resolve;
    });
    const render = createRenderHarness(vi.fn(() => pendingModels));
    const compute = createComputeSystem();
    const dependencies = createDependencies(render.system, compute);
    const world = createOceanFishBoids({ renderer }, dependencies);

    world.dispose();
    world.dispose();
    resolveModels([
      {
        species: RESIDENT_SPECIES[0]!,
        model: { geometry: new BufferGeometry(), diffuseMap: null },
      },
    ]);
    await world.ready;

    expect(dependencies.createComputeSystem).not.toHaveBeenCalled();
    expect(render.system.createResidentMeshes).not.toHaveBeenCalled();
    expect(render.system.dispose).toHaveBeenCalledOnce();
    expect(world.mode).toBe("disposed");
    expect(world.isReady).toBe(false);
    expect(world.object.children).toHaveLength(0);
  });
});
