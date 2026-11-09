import { BackgroundType } from "@austencloud/backgrounds";
import { Group, Raycaster, Scene, Vector2, Vector3 } from "three";
import type {
  GLTF,
  GLTFLoader,
} from "three/examples/jsm/loaders/GLTFLoader.js";
import { requireRegisteredEnvironment } from "../../environments/registry/environment-registry";
import {
  causticUniforms,
  DEFAULT_CAUSTIC_STRENGTH,
} from "../../environments/scenes/ocean/runtime/atmosphere/seabed-caustics";
import { oceanFloraSceneUrl } from "../../environments/scenes/ocean/authored/ocean-flora-url";
import {
  createOceanAuthoredFloraController,
  enhanceOceanSeabed,
} from "../../environments/worlds/ocean/ocean-authored-flora";
import { createOceanDepthGradient } from "../../environments/worlds/ocean/ocean-depth-gradient";
import { createOceanFishBoids } from "../../environments/worlds/ocean/ocean-fish-boids";
import { createOceanGodRayShafts } from "../../environments/worlds/ocean/ocean-god-ray-shafts";
import { createOceanLightingRig } from "../../environments/worlds/ocean/ocean-lighting-rig";
import { createOceanJellyfishSwarm } from "../../environments/worlds/ocean/ocean-jellyfish-swarm";
import { createOceanMarineParticles } from "../../environments/worlds/ocean/ocean-marine-particles";
import { createOceanRuinsPlatform } from "../../environments/worlds/ocean/ocean-ruins-platform";
import { applyOceanSceneAppearance } from "../../environments/worlds/ocean/ocean-scene-appearance";
import { createOceanWaterSurface } from "../../environments/worlds/ocean/ocean-water-surface";
import {
  disposeWorkerWorldTree,
  type WorkerEnvironmentWorld,
  type WorkerWorldContext,
} from "./worker-environment-world";
import { createRegistryGltfLoader } from "./registry-gltf-loader";

const OCEAN_WORLD_Y_OFFSET = -1.95;

function absoluteAssetUrl(path: string): string {
  return new URL(path, globalThis.location.href).href;
}

function loadGltf(
  loader: GLTFLoader,
  url: string,
  onProgress: (loaded: number, total: number) => void
): Promise<GLTF> {
  return new Promise((resolve, reject) => {
    loader.load(
      absoluteAssetUrl(url),
      resolve,
      (event) => onProgress(event.loaded, event.total),
      reject
    );
  });
}

/**
 * Ocean's exact static production layers in the worker renderer.
 *
 * The authored reef, seabed treatment, stage, atmosphere, water, jellyfish,
 * fog, IBL, and complete motivated light rig all come from the production
 * owners. Fish, interaction/audio and post-processing remain explicit parity
 * gates.
 */
export async function createOceanPrototypeWorld(
  context: WorkerWorldContext
): Promise<WorkerEnvironmentWorld> {
  const scene = new Scene();
  const world = new Group();
  world.name = "OceanWorld";
  world.position.y = OCEAN_WORLD_Y_OFFSET;
  scene.add(world);

  let groundY = context.performers[0]?.groundY ?? -1.5;
  const appearance = applyOceanSceneAppearance({
    scene,
    renderer: context.renderer,
    enableFog: true,
    enableImageBasedLighting: true,
  });

  // The seabed's URL and decoders come from static/models/ocean/scene.json,
  // the same manifest the main-thread OceanScene reads.
  const seabedSource = createRegistryGltfLoader(
    requireRegisteredEnvironment(BackgroundType.OCEAN),
    context.renderer
  );
  const { loader } = seabedSource;

  const loaded: [number, number] = [0, 0];
  const totals: [number, number] = [0, 0];
  const report = (index: number, value: number, total: number) => {
    loaded[index] = value;
    totals[index] = total;
    const knownTotal = totals[0] + totals[1];
    const fraction = knownTotal > 0 ? (loaded[0] + loaded[1]) / knownTotal : 0;
    context.reportProgress("assets", Math.min(0.95, fraction));
  };

  let seabed: GLTF;
  let flora: GLTF;
  try {
    [seabed, flora] = await Promise.all([
      loadGltf(loader, seabedSource.url, (value, total) =>
        report(0, value, total)
      ),
      loadGltf(loader, oceanFloraSceneUrl(), (value, total) =>
        report(1, value, total)
      ),
    ]);
  } finally {
    seabedSource.dispose();
  }
  context.reportProgress("assets", 1);

  enhanceOceanSeabed(seabed.scene, { enableCaustics: true });
  const floraController = createOceanAuthoredFloraController(flora.scene, {
    groundY: groundY + OCEAN_WORLD_Y_OFFSET,
    swayEnabled: true,
  });
  world.add(seabed.scene, flora.scene);

  const depth = createOceanDepthGradient();
  const water = createOceanWaterSurface({ groundY });
  const godRays = createOceanGodRayShafts({
    groundY,
    worldYOffset: OCEAN_WORLD_Y_OFFSET,
    enabled: true,
  });
  const particles = createOceanMarineParticles({ count: 4000, groundY });
  const ruins = createOceanRuinsPlatform(
    {
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
      zOffset: 0,
    },
    groundY
  );
  const lighting = createOceanLightingRig({
    groundY,
    hemisphereEnabled: true,
  });
  const jellyfish = createOceanJellyfishSwarm(20);
  const cursorRay = {
    origin: new Vector3(),
    dir: new Vector3(0, 0, -1),
    active: false,
  };
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const fish = createOceanFishBoids({
    renderer: context.renderer,
    cursorRay,
    groundY,
    worldYOffset: OCEAN_WORLD_Y_OFFSET,
  });
  world.add(
    depth.object,
    water.object,
    godRays.object,
    particles.object,
    ruins.object,
    lighting.object,
    jellyfish.object,
    fish.object
  );
  await fish.ready;

  causticUniforms.uGroundY.value = groundY + OCEAN_WORLD_Y_OFFSET;
  causticUniforms.uCausticStrength.value = DEFAULT_CAUSTIC_STRENGTH;
  context.reportProgress("construct", 1);

  function setGroundY(nextGroundY: number): void {
    if (nextGroundY === groundY) return;
    groundY = nextGroundY;
    water.setGroundY(groundY);
    godRays.setGroundY(groundY, OCEAN_WORLD_Y_OFFSET);
    particles.setGroundY(groundY);
    ruins.setGroundY(groundY);
    lighting.setGroundY(groundY);
    floraController.setGroundY(groundY + OCEAN_WORLD_Y_OFFSET);
    fish.setGroundY(groundY);
    causticUniforms.uGroundY.value = groundY + OCEAN_WORLD_Y_OFFSET;
  }

  return {
    environment: "ocean",
    scene,
    useViewerBaseLighting: false,
    update(deltaSeconds) {
      causticUniforms.uTime.value += deltaSeconds;
      depth.update(context.camera);
      water.update(deltaSeconds, context.camera);
      godRays.update(deltaSeconds);
      particles.update(deltaSeconds);
      ruins.update(deltaSeconds);
      jellyfish.update(deltaSeconds);
      fish.update(deltaSeconds, context.camera);
      floraController.update(deltaSeconds, context.camera);
    },
    setPerformers(performers) {
      setGroundY(performers[0]?.groundY ?? -1.5);
    },
    pointerMove(ndcX, ndcY) {
      pointer.set(ndcX, ndcY);
      raycaster.setFromCamera(pointer, context.camera);
      cursorRay.origin.copy(raycaster.ray.origin);
      cursorRay.dir.copy(raycaster.ray.direction);
      cursorRay.active = true;
      return jellyfish.hoverAt(ndcX, ndcY, context.camera);
    },
    pointerLeave() {
      cursorRay.active = false;
    },
    pointerDown(ndcX, ndcY) {
      pointer.set(ndcX, ndcY);
      raycaster.setFromCamera(pointer, context.camera);
      cursorRay.origin.copy(raycaster.ray.origin);
      cursorRay.dir.copy(raycaster.ray.direction);
      cursorRay.active = true;
      return jellyfish.interactAt(ndcX, ndcY, context.camera);
    },
    dispose() {
      floraController.dispose();
      appearance.dispose();
      world.remove(
        depth.object,
        water.object,
        godRays.object,
        particles.object,
        ruins.object,
        lighting.object
      );
      depth.dispose();
      water.dispose();
      godRays.dispose();
      particles.dispose();
      ruins.dispose();
      lighting.dispose();
      jellyfish.dispose();
      fish.dispose();
      disposeWorkerWorldTree(scene);
      scene.background = null;
      scene.fog = null;
    },
  };
}

export const OCEAN_PROTOTYPE_CAMERA = {
  position: [0, 4.5, 19] as const,
  target: [0, 1.6, -2] as const,
  fov: 46,
};
