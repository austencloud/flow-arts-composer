import {
  Color,
  FogExp2,
  Group,
  ImageBitmapLoader,
  MeshStandardMaterial,
  SRGBColorSpace,
  Texture,
  type Camera,
  type Material,
  type Mesh,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from "three";
import {
  GLTFLoader,
  type GLTF,
} from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

import {
  createDefaultBlossomConfig,
  type BlossomSceneConfig,
} from "../../domain/models/scene-configs";
import {
  createBlossomRuntimeConfig,
  createBlossomStageTransform,
  type BlossomQualityTier,
} from "../../scenes/cherry-blossom/blossom-runtime";
import { getBlossomActiveProductionPhase } from "../../scenes/cherry-blossom/blossom-site";
import { getBlossomStageFootprint } from "../../scenes/cherry-blossom/blossom-stage-operations";
import {
  createBlossomAtmosphere,
  type BlossomAtmosphere,
} from "./blossom-atmosphere";
import {
  createBlossomLightingRig,
  type BlossomLightingRig,
} from "./blossom-lighting-rig";
import { createBlossomRiver, type BlossomRiver } from "./blossom-river";
import { createBlossomStage, type BlossomStage } from "./blossom-stage";

export const BLOSSOM_ENVIRONMENT_URL =
  "/models/blossom/blossom_environment.glb";
export const BLOSSOM_MOON_TEXTURE_URL = "/textures/moon.png";
export const BLOSSOM_AUTHORED_RESOURCE_URLS = [
  BLOSSOM_ENVIRONMENT_URL,
  BLOSSOM_MOON_TEXTURE_URL,
] as const;

export interface BlossomEnvironmentAssets {
  environmentRoot: Object3D;
  moonTexture: Texture;
}

export interface BlossomEnvironmentWorldOptions {
  renderer: WebGLRenderer;
  config?: BlossomSceneConfig;
  groundY: number;
  stageWidth?: number;
  stageDepth?: number;
  stageZOffset?: number;
  showDirectionCues?: boolean;
  qualityTier: BlossomQualityTier;
  reducedMotion?: boolean;
  random?: () => number;
}

export interface LoadBlossomAssetsOptions {
  renderer: WebGLRenderer;
  resolveAssetUrl?: (path: string) => string;
  onProgress?: (fraction: number) => void;
}

export interface BlossomEnvironmentWorld {
  root: Group;
  reflector: BlossomRiver["object"] | null;
  fog: FogExp2;
  background: Color;
  authoredResourceUrls: readonly string[];
  qualityTier: BlossomQualityTier;
  maxPixelRatio: number;
  update(deltaSeconds: number, camera: Camera): void;
  setGroundY(groundY: number): void;
  setLayout(
    stageWidth: number,
    stageDepth: number,
    stageZOffset: number,
    showDirectionCues: boolean
  ): void;
  setActive(active: boolean): void;
  dispose(): void;
}

const HIDDEN_RUNTIME_OWNERS = new Set([
  "Twilight_Backdrop",
  "Moon_Disc",
  "Stage_Base",
  "Stage_Rim",
  "Stage_Planks",
  "Stage_Feet",
]);

function defaultAssetUrl(path: string): string {
  if (typeof globalThis.location === "undefined") return path;
  return new URL(path, globalThis.location.href).href;
}

function loadGltf(loader: GLTFLoader, url: string): Promise<GLTF> {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

function loadBitmapTexture(
  loader: ImageBitmapLoader,
  url: string
): Promise<Texture> {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (bitmap) => {
        const texture = new Texture(bitmap);
        texture.flipY = false;
        texture.needsUpdate = true;
        resolve(texture);
      },
      undefined,
      reject
    );
  });
}

function disposeMaterial(material: Material): void {
  material.dispose();
}

function disposeAuthoredTree(root: Object3D): void {
  const disposedTextures = new Set<Texture>();
  root.traverse((object) => {
    const mesh = object as Mesh;
    mesh.geometry?.dispose();
    if (!mesh.material) return;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof Texture && !disposedTextures.has(value)) {
          disposedTextures.add(value);
          value.dispose();
        }
      }
      disposeMaterial(material);
    }
  });
  root.clear();
}

/** Surface textures are packed into the venue; only the moon is separate. */
export async function loadBlossomEnvironmentAssets(
  options: LoadBlossomAssetsOptions
): Promise<BlossomEnvironmentAssets> {
  const resolveAssetUrl = options.resolveAssetUrl ?? defaultAssetUrl;
  const gltfLoader = new GLTFLoader();
  gltfLoader.setMeshoptDecoder(MeshoptDecoder);
  const ktx2Loader = new KTX2Loader()
    .setTranscoderPath(resolveAssetUrl("/basis/"))
    .detectSupport(options.renderer);
  gltfLoader.setKTX2Loader(ktx2Loader);
  const bitmapLoader = new ImageBitmapLoader();
  bitmapLoader.setOptions({ imageOrientation: "flipY" });
  const loadedTextures = new Set<Texture>();
  let completed = 0;
  const finish = <T>(value: T): T => {
    if (value instanceof Texture) loadedTextures.add(value);
    completed += 1;
    options.onProgress?.(completed / BLOSSOM_AUTHORED_RESOURCE_URLS.length);
    return value;
  };

  try {
    const [gltf, moonTexture] = await Promise.all([
      loadGltf(gltfLoader, resolveAssetUrl(BLOSSOM_ENVIRONMENT_URL)).then(
        finish
      ),
      loadBitmapTexture(
        bitmapLoader,
        resolveAssetUrl(BLOSSOM_MOON_TEXTURE_URL)
      ).then(finish),
    ]);
    moonTexture.colorSpace = SRGBColorSpace;
    return {
      environmentRoot: gltf.scene,
      moonTexture,
    };
  } catch (error) {
    for (const texture of loadedTextures) texture.dispose();
    throw error;
  } finally {
    ktx2Loader.dispose();
  }
}

function configureAuthoredEnvironment(
  root: Object3D,
  reflectiveWater: boolean,
  shadows: boolean
): void {
  root.traverse((child) => {
    const mesh = child as Mesh;
    const identity = `${child.name} ${mesh.geometry?.name ?? ""}`;
    if (HIDDEN_RUNTIME_OWNERS.has(child.name)) child.visible = false;
    if (
      identity.includes("Moonlit River Mesh") ||
      identity.includes("River_Water")
    ) {
      child.visible = !reflectiveWater;
    }
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    for (const material of materials) {
      const groundMaterial = material as MeshStandardMaterial;
      if (
        groundMaterial.isMeshStandardMaterial &&
        material.name === "Amphitheatre moss"
      ) {
        // Match the meadow blades after the cool moon lighting desaturates the atlas.
        groundMaterial.color.setRGB(0.3, 0.54, 0.23);
      }
      if (
        material instanceof MeshStandardMaterial &&
        material.name === "Ancient cherry bark"
      ) {
        material.color.set("#89706a");
      }
      if (
        material instanceof MeshStandardMaterial &&
        material.name === "Sakura flower clusters"
      ) {
        material.transparent = false;
        material.alphaTest = 0.38;
        material.depthWrite = true;
        material.emissive.set("#e8a2b9");
        material.emissiveIntensity = 0.12;
        material.needsUpdate = true;
      }
      if (
        material instanceof MeshStandardMaterial &&
        material.map &&
        /slate|stone|basalt|bark/i.test(material.name)
      ) {
        material.bumpMap = material.map;
        material.bumpScale = /slate/i.test(material.name) ? 0.025 : 0.06;
        material.needsUpdate = true;
      }
      if (
        !(material instanceof MeshStandardMaterial) ||
        !material.name.startsWith("Blossom Cherry")
      )
        continue;
      if (material.alphaTest > 0) {
        // A small transmission approximation keeps unlit petal faces pink.
        material.emissive.set("#e8b4c3");
        material.emissiveIntensity = 0.1;
      } else {
        material.color.set("#92766c");
      }
    }
    mesh.receiveShadow =
      child.userData.blossomRole === "terrain" ||
      child.userData.blossomRole === "architecture" ||
      child.userData.blossomRole === "stone" ||
      child.userData.blossomRole === "path" ||
      child.userData.blossomRole === "bark" ||
      /Garden(?:_| )Ground/.test(identity) ||
      identity.includes("Gravel") ||
      identity.includes("GardenEcology") ||
      identity.includes("Audience_") ||
      identity.includes("Path_") ||
      identity.includes("Operations_") ||
      identity.includes("Bridge") ||
      identity.includes("Stone") ||
      identity.includes("Boulder");
    mesh.castShadow =
      shadows &&
      (["bark", "petals", "stone", "lantern", "architecture"].includes(
        child.userData.blossomRole
      ) ||
        identity.includes("Sakura") ||
        /Blossom(?:_| )open-crown/.test(identity) ||
        identity.includes("PlantFactory_") ||
        identity.includes("GardenEcology") ||
        identity.includes("Torii") ||
        identity.includes("Bridge") ||
        identity.includes("Lantern") ||
        identity.includes("Stone") ||
        identity.includes("Boulder"));
  });
}

function findCourtMaterial(root: Object3D): MeshStandardMaterial | undefined {
  let result: MeshStandardMaterial | undefined;
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    result ??= materials.find(
      (material): material is MeshStandardMaterial =>
        material instanceof MeshStandardMaterial &&
        material.name === "Blossom court slate"
    );
  });
  return result;
}

/** Build the exact production Blossom graph from already-loaded assets. */
export function createBlossomEnvironmentWorld(
  options: BlossomEnvironmentWorldOptions,
  assets: BlossomEnvironmentAssets
): BlossomEnvironmentWorld {
  const config = options.config ?? createDefaultBlossomConfig();
  const footprint = getBlossomStageFootprint();
  const stageWidth = Math.max(options.stageWidth ?? 0, footprint.width);
  const stageDepth = Math.max(options.stageDepth ?? 0, footprint.depth);
  const stageZOffset = options.stageZOffset ?? 0;
  const reducedMotion = options.reducedMotion ?? false;
  const motionScale = reducedMotion ? 0 : 1;
  const runtime = createBlossomRuntimeConfig({
    tier: options.qualityTier,
    prefersReducedMotion: reducedMotion,
    stageWidth,
    stageDepth,
    stageZOffset,
    groundY: options.groundY,
    particleCounts: {
      petals: config.petals.count,
      distantPetals: config.distantPetals?.count ?? 0,
      fireflies: config.fireflies?.count ?? 0,
    },
    lightIntensities: {
      hemisphere: config.hemisphereLight.intensity,
      key: config.moonLight?.enabled ? config.moonLight.intensity : 0,
    },
  });

  const root = new Group();
  root.name = "blossom-environment-world";
  const authored = new Group();
  authored.name = "BlossomEnvironment";
  authored.position.set(...runtime.stage.position);
  authored.scale.set(...runtime.stage.scale);
  authored.rotation.y = Math.PI;
  assets.environmentRoot.name ||= "blossom-authored-environment";
  configureAuthoredEnvironment(
    assets.environmentRoot,
    runtime.effects.reflectiveWater,
    runtime.effects.shadows
  );
  authored.add(assets.environmentRoot);

  const atmosphere: BlossomAtmosphere = createBlossomAtmosphere({
    config,
    runtime,
    moonTexture: assets.moonTexture,
    decorativeAtmosphereEnabled: getBlossomActiveProductionPhase() >= 5,
    motionScale,
    random: options.random,
  });
  const stage: BlossomStage = createBlossomStage({
    width: stageWidth,
    depth: stageDepth,
    groundY: options.groundY,
    showDirectionCues: options.showDirectionCues ?? true,
    surfaceMaterial: findCourtMaterial(assets.environmentRoot),
  });
  const river = runtime.effects.reflectiveWater
    ? createBlossomRiver(options.groundY, stageZOffset)
    : null;
  const lighting: BlossomLightingRig = createBlossomLightingRig(
    config,
    runtime,
    options.groundY,
    stageZOffset
  );
  root.add(authored, atmosphere.object, stage.object, lighting.object);

  const fog = new FogExp2(config.fog.color, config.fog.density);
  const background = new Color(config.sky.topColor);
  const textures = new Set<Texture>([assets.moonTexture]);
  let disposed = false;

  function setGroundY(groundY: number): void {
    authored.position.y = groundY;
    stage.setGroundY(groundY);
    river?.setGroundY(groundY);
    lighting.setGroundY(groundY);
  }

  function setLayout(
    nextWidth: number,
    nextDepth: number,
    nextStageZOffset: number,
    showDirectionCues: boolean
  ): void {
    const effectiveWidth = Math.max(nextWidth, footprint.width);
    const effectiveDepth = Math.max(nextDepth, footprint.depth);
    stage.setLayout(effectiveWidth, effectiveDepth, showDirectionCues);
    const stageTransform = createBlossomStageTransform({
      stageWidth: effectiveWidth,
      stageDepth: effectiveDepth,
      stageZOffset: nextStageZOffset,
      groundY: authored.position.y,
    });
    atmosphere.setLayout(stageTransform.atmosphereScale, nextStageZOffset);
    if (authored.position.z !== nextStageZOffset) {
      authored.position.z = nextStageZOffset;
      river?.setStageZOffset(nextStageZOffset);
      lighting.setStageZOffset(nextStageZOffset);
    }
  }

  return {
    root,
    reflector: river?.object ?? null,
    fog,
    background,
    authoredResourceUrls: BLOSSOM_AUTHORED_RESOURCE_URLS,
    qualityTier: options.qualityTier,
    maxPixelRatio: runtime.maxPixelRatio,
    update(deltaSeconds, camera) {
      if (disposed) return;
      atmosphere.update(deltaSeconds, camera);
      river?.update(deltaSeconds);
    },
    setGroundY,
    setLayout,
    setActive(active) {
      root.visible = active;
      river?.setActive(active);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      atmosphere.dispose();
      stage.dispose();
      river?.dispose();
      lighting.dispose();
      disposeAuthoredTree(assets.environmentRoot);
      for (const texture of textures) texture.dispose();
      root.clear();
    },
  };
}

export async function createLoadedBlossomEnvironmentWorld(
  options: BlossomEnvironmentWorldOptions & LoadBlossomAssetsOptions
): Promise<BlossomEnvironmentWorld> {
  const assets = await loadBlossomEnvironmentAssets(options);
  return createBlossomEnvironmentWorld(options, assets);
}

export function attachBlossomEnvironmentWorld(
  scene: Scene,
  world: BlossomEnvironmentWorld
): () => void {
  scene.add(world.root);
  if (world.reflector) scene.add(world.reflector);
  return () => {
    scene.remove(world.root);
    if (world.reflector) scene.remove(world.reflector);
  };
}
