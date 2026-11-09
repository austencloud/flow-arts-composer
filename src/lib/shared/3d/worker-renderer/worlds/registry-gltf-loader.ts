import type { WebGLRenderer } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type { EnvironmentDef } from "../../environments/registry/environment-manifest";

/** A loader set up for one registered scene's GLB, and the means to free it. */
export interface RegistryGltfLoader {
  loader: GLTFLoader;
  /** Absolute URL of the scene's GLB, ready for a worker fetch. */
  url: string;
  dispose: () => void;
}

function absoluteAssetUrl(path: string): string {
  return new URL(path, globalThis.location.href).href;
}

/**
 * The worker renderer's counterpart to `GlbEnvironment`'s decoder choice: the
 * GLB URL and its geometry and texture decoders come from the scene's
 * `scene.json`, so the worker and the main-thread scene cannot drift onto
 * different files or codecs. Companion assets a world streams itself (the
 * ocean's reef) load through the same loader.
 */
export function createRegistryGltfLoader(
  environment: Pick<EnvironmentDef, "glbUrl" | "compression">,
  renderer: WebGLRenderer
): RegistryGltfLoader {
  const loader = new GLTFLoader();
  const disposers: Array<() => void> = [];
  const { geometry, texture } = environment.compression;

  if (geometry === "meshopt") loader.setMeshoptDecoder(MeshoptDecoder);
  if (geometry === "draco") {
    const draco = new DRACOLoader().setDecoderPath(absoluteAssetUrl("/draco/"));
    loader.setDRACOLoader(draco);
    disposers.push(() => draco.dispose());
  }
  if (texture === "ktx2") {
    const ktx2 = new KTX2Loader()
      .setTranscoderPath(absoluteAssetUrl("/basis/"))
      .detectSupport(renderer);
    loader.setKTX2Loader(ktx2);
    disposers.push(() => ktx2.dispose());
  }

  return {
    loader,
    url: absoluteAssetUrl(environment.glbUrl),
    dispose: () => {
      for (const dispose of disposers) dispose();
    },
  };
}
