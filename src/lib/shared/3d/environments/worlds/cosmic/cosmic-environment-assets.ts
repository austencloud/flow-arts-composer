import {
  ImageBitmapLoader,
  Texture,
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
  COSMIC_EARTH_TEXTURE_URL,
  COSMIC_RELIQUARY_URL,
} from "./cosmic-asset-urls";

export { COSMIC_EARTH_TEXTURE_URL, COSMIC_RELIQUARY_URL };

export interface CosmicEnvironmentAssets {
  authoredScene: Object3D;
  earthTexture: Texture;
}

export interface CosmicAssetProgress {
  loaded: number;
  total: number;
}

const assetsByRenderer = new WeakMap<
  WebGLRenderer,
  Promise<CosmicEnvironmentAssets>
>();

function absoluteAssetUrl(path: string): string {
  return new URL(path, globalThis.location.href).href;
}

function loadGltf(
  loader: GLTFLoader,
  onProgress?: (progress: CosmicAssetProgress) => void
): Promise<GLTF> {
  return new Promise((resolve, reject) => {
    loader.load(
      absoluteAssetUrl(COSMIC_RELIQUARY_URL),
      resolve,
      (event) => onProgress?.({ loaded: event.loaded, total: event.total }),
      reject
    );
  });
}

async function loadTexture(path: string): Promise<Texture> {
  // TextureLoader depends on an HTMLImageElement, which does not exist inside
  // the renderer worker. ImageBitmapLoader follows the same browser decode path
  // in both runtimes; flipY preserves TextureLoader's production orientation.
  const image = await new ImageBitmapLoader()
    .setOptions({ imageOrientation: "flipY" })
    .loadAsync(absoluteAssetUrl(path));
  const texture = new Texture(image);
  texture.needsUpdate = true;
  return texture;
}

async function loadUncachedAssets(
  renderer: WebGLRenderer,
  onProgress?: (fraction: number) => void
): Promise<CosmicEnvironmentAssets> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const ktx2Loader = new KTX2Loader()
    .setTranscoderPath(absoluteAssetUrl("/basis/"))
    .detectSupport(renderer);
  loader.setKTX2Loader(ktx2Loader);

  try {
    const [gltf, earthTexture] = await Promise.all([
      loadGltf(loader, ({ loaded, total }) => {
        const fraction = total > 0 ? loaded / total : 0;
        onProgress?.(Math.min(0.7, fraction * 0.7));
      }),
      loadTexture(COSMIC_EARTH_TEXTURE_URL).then((texture) => {
        onProgress?.(0.3);
        return texture;
      }),
    ]);
    onProgress?.(1);
    return { authoredScene: gltf.scene, earthTexture };
  } finally {
    ktx2Loader.dispose();
  }
}

/**
 * Loads Cosmic's two authored assets once per renderer. A return trip can then
 * reattach the same GPU-backed graph instead of paying a second parse/decode.
 */
export function loadCosmicEnvironmentAssets(
  renderer: WebGLRenderer,
  onProgress?: (fraction: number) => void
): Promise<CosmicEnvironmentAssets> {
  const existing = assetsByRenderer.get(renderer);
  if (existing) {
    onProgress?.(1);
    return existing;
  }

  const pending = loadUncachedAssets(renderer, onProgress);
  assetsByRenderer.set(renderer, pending);
  void pending.catch(() => {
    if (assetsByRenderer.get(renderer) === pending) {
      assetsByRenderer.delete(renderer);
    }
  });
  return pending;
}
