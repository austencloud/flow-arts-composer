import {
  Color,
  DirectionalLight,
  FogExp2,
  Group,
  HemisphereLight,
  Scene,
  type Camera,
  type Object3D,
  type WebGLRenderer,
} from "three";
import {
  GLTFLoader,
  type GLTF,
} from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

import {
  createDefaultCelestialConfig,
  type CelestialSceneConfig,
} from "../../domain/models/scene-configs";
import {
  createCelestialAtmosphere,
  type CelestialAtmosphere,
} from "./celestial-atmosphere";
import {
  CELESTIAL_AUTHORED_RESOURCE_COUNT,
  createCelestialCloudbreakWorld,
  type CelestialCloudbreakAssets,
  type CelestialCloudbreakWorld,
} from "./celestial-cloudbreak-world";

export const CELESTIAL_SHELL_URL =
  "/models/celestial/sky-citadel.glb?v=citadel-polish-r1";
export const CELESTIAL_AUTHORED_RESOURCE_URLS = [CELESTIAL_SHELL_URL] as const;

export type CelestialEnvironmentAssets = CelestialCloudbreakAssets;

export interface CelestialEnvironmentWorldOptions {
  config?: CelestialSceneConfig;
  groundY: number;
  stageWidth?: number;
  stageDepth?: number;
  stageRadius?: number;
  stageRadiusGrowth?: number;
  worldYOffset?: number;
  contentTier?: "low" | "standard" | "high";
  motionScale?: number;
  random?: () => number;
}

export interface LoadCelestialAssetsOptions {
  renderer: WebGLRenderer;
  resolveAssetUrl?: (path: string) => string;
  onProgress?: (fraction: number) => void;
}

export interface CelestialEnvironmentWorld {
  root: Group;
  reflector: CelestialCloudbreakWorld["reflector"];
  fog: FogExp2;
  background: Color;
  authoredResourceUrls: readonly string[];
  update(deltaSeconds: number, elapsedSeconds: number, camera: Camera): void;
  pulse(): void;
  setGroundY(groundY: number): void;
  setStageBounds(radius: number, growth: number): void;
  setActive(active: boolean): void;
  dispose(): void;
}

function defaultAssetUrl(path: string): string {
  if (typeof globalThis.location === "undefined") return path;
  return new URL(path, globalThis.location.href).href;
}

function loadGltf(loader: GLTFLoader, url: string): Promise<GLTF> {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

/** Load the complete Blender-authored sky citadel. */
export async function loadCelestialEnvironmentAssets(
  options: LoadCelestialAssetsOptions
): Promise<CelestialEnvironmentAssets> {
  const resolveAssetUrl = options.resolveAssetUrl ?? defaultAssetUrl;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const ktx2Loader = new KTX2Loader()
    .setTranscoderPath(resolveAssetUrl("/basis/"))
    .detectSupport(options.renderer);
  loader.setKTX2Loader(ktx2Loader);
  let completed = 0;
  const reportComplete = <T>(value: T): T => {
    completed += 1;
    options.onProgress?.(completed / CELESTIAL_AUTHORED_RESOURCE_COUNT);
    return value;
  };

  try {
    const shell = await loadGltf(
      loader,
      resolveAssetUrl(CELESTIAL_SHELL_URL)
    ).then(reportComplete);
    return { shell: shell.scene };
  } finally {
    ktx2Loader.dispose();
  }
}

function createLighting(config: CelestialSceneConfig): Group {
  const root = new Group();
  root.name = "celestial-lighting";
  root.add(
    new HemisphereLight(
      config.hemisphereLight.skyColor,
      config.hemisphereLight.groundColor,
      config.hemisphereLight.intensity
    )
  );
  if (config.sunLight?.enabled) {
    const light = new DirectionalLight(
      config.sunLight.color,
      config.sunLight.intensity
    );
    light.name = "celestial-sun-light";
    light.position.set(...config.sunLight.position);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.camera.near = 1;
    light.shadow.camera.far = 180;
    light.shadow.camera.left = -32;
    light.shadow.camera.right = 32;
    light.shadow.camera.top = 28;
    light.shadow.camera.bottom = -28;
    light.shadow.bias = -0.0015;
    light.shadow.normalBias = 0.08;
    light.shadow.radius = 3;
    light.shadow.intensity = 0.85;
    root.add(light);
  }
  const fill = new DirectionalLight("#bfd3e8", 0.42);
  fill.name = "celestial-cold-fill";
  fill.position.set(-18, 12, 24);
  root.add(fill);
  return root;
}

/** Build the production Celestial graph from already-loaded authored assets. */
export function createCelestialEnvironmentWorld(
  options: CelestialEnvironmentWorldOptions,
  assets: CelestialEnvironmentAssets
): CelestialEnvironmentWorld {
  const config = options.config ?? createDefaultCelestialConfig();
  const stageWidth = options.stageWidth ?? 6;
  const stageDepth = options.stageDepth ?? 6;
  const stageRadius = options.stageRadius ?? 3;
  const stageRadiusGrowth = options.stageRadiusGrowth ?? 0;
  const worldYOffset = options.worldYOffset ?? 0;
  const cloudBankCount =
    options.contentTier === "low"
      ? 12
      : options.contentTier === "high"
        ? 26
        : 20;
  const reflectionResolution = options.contentTier === "high" ? 768 : 512;

  const root = new Group();
  root.name = "celestial-environment-world";
  const atmosphere: CelestialAtmosphere = createCelestialAtmosphere({
    config,
    cloudBankCount,
    stageWidth,
    stageDepth,
    worldYOffset,
    motionScale: options.motionScale ?? 1,
    random: options.random,
  });
  const cloudbreak = createCelestialCloudbreakWorld(
    {
      groundY: options.groundY,
      stageRadius,
      stageRadiusGrowth,
      worldYOffset,
      reflectionResolution,
      motionScale: options.motionScale ?? 1,
    },
    assets
  );
  const lighting = createLighting(config);
  lighting.position.y = worldYOffset;
  root.add(atmosphere.object, cloudbreak.object, lighting);

  const fog = new FogExp2(config.fog.color, config.fog.density);
  const background = new Color(config.sky.topColor);
  let disposed = false;
  return {
    root,
    reflector: cloudbreak.reflector,
    fog,
    background,
    authoredResourceUrls: CELESTIAL_AUTHORED_RESOURCE_URLS,
    update(deltaSeconds, elapsedSeconds, camera) {
      if (disposed) return;
      atmosphere.update(deltaSeconds, camera);
      cloudbreak.update(deltaSeconds);
      void elapsedSeconds;
    },
    pulse() {
      if (disposed) return;
      atmosphere.pulse();
      cloudbreak.pulse();
    },
    setGroundY(groundY) {
      if (disposed) return;
      cloudbreak.setGroundY(groundY);
    },
    setStageBounds(radius, growth) {
      if (!disposed) cloudbreak.setStageBounds(radius, growth);
    },
    setActive(active) {
      root.visible = active;
      cloudbreak.setActive(active);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      atmosphere.dispose();
      cloudbreak.dispose();
      root.clear();
    },
  };
}

export async function createLoadedCelestialEnvironmentWorld(
  options: CelestialEnvironmentWorldOptions & LoadCelestialAssetsOptions
): Promise<CelestialEnvironmentWorld> {
  const assets = await loadCelestialEnvironmentAssets(options);
  return createCelestialEnvironmentWorld(options, assets);
}

/** Shared attachment contract used by both the declarative and worker shells. */
export function attachCelestialEnvironmentWorld(
  scene: Scene,
  world: CelestialEnvironmentWorld
): () => void {
  scene.add(world.root, world.reflector);
  return () => {
    scene.remove(world.root, world.reflector);
  };
}
