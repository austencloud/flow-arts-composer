import { Texture, type Scene } from "three";
import type { WorkerViewport } from "../domain/worker-renderer-protocol";

const DRIVER_OVERHEAD_FACTOR = 1.25;
const FIXED_RUNTIME_OVERHEAD_BYTES = 8 * 1024 * 1024;

export interface WorkerRuntimeMemoryEstimate {
  bytes: number;
  skipReason: string | null;
}

function textureBytes(texture: Texture): WorkerRuntimeMemoryEstimate {
  const compressed = texture as Texture & {
    isCompressedTexture?: boolean;
    isRenderTargetTexture?: boolean;
    mipmaps?: readonly { data?: ArrayBufferView }[];
  };
  if (compressed.isRenderTargetTexture) return { bytes: 0, skipReason: null };
  const label = texture.name || texture.constructor.name;
  if (compressed.isCompressedTexture) {
    const mipBytes = compressed.mipmaps?.reduce(
      (total, mip) => total + (mip.data?.byteLength ?? 0),
      0
    );
    if (!mipBytes) {
      return {
        bytes: 0,
        skipReason: `compressed texture has no mip bytes (${label})`,
      };
    }
    return {
      bytes: Math.ceil(mipBytes * DRIVER_OVERHEAD_FACTOR),
      skipReason: null,
    };
  }

  const image = texture.image as
    | { width?: number; height?: number; data?: ArrayBufferView }
    | undefined;
  if (image?.data) {
    const mipFactor = texture.generateMipmaps ? 4 / 3 : 1;
    return {
      bytes: Math.ceil(
        image.data.byteLength * mipFactor * DRIVER_OVERHEAD_FACTOR
      ),
      skipReason: null,
    };
  }
  if (!image?.width || !image.height) {
    return {
      bytes: 0,
      skipReason: `texture dimensions are unavailable (${label})`,
    };
  }
  const mipFactor = texture.generateMipmaps ? 4 / 3 : 1;
  return {
    bytes: Math.ceil(
      image.width * image.height * 4 * mipFactor * DRIVER_OVERHEAD_FACTOR
    ),
    skipReason: null,
  };
}

/** Estimates retained GPU-facing allocations; unknown textures reject caching. */
export function estimateWorkerRuntimeBytes(
  scene: Scene,
  viewport: WorkerViewport
): WorkerRuntimeMemoryEstimate {
  const geometries = new Set<object>();
  const textures = new Set<Texture>();
  let bytes = 0;
  let skipReason: string | null = null;
  const addTexture = (value: unknown): void => {
    if (!(value instanceof Texture) || textures.has(value) || skipReason)
      return;
    textures.add(value);
    const estimate = textureBytes(value);
    bytes += estimate.bytes;
    skipReason = estimate.skipReason;
  };
  scene.traverse((object) => {
    const renderable = object as typeof object & {
      geometry?: {
        attributes?: Record<string, { array?: ArrayBufferView }>;
        index?: { array?: ArrayBufferView };
      };
      material?: { [key: string]: unknown } | { [key: string]: unknown }[];
    };
    const geometry = renderable.geometry;
    if (geometry && !geometries.has(geometry)) {
      geometries.add(geometry);
      for (const attribute of Object.values(geometry.attributes ?? {})) {
        bytes += attribute.array?.byteLength ?? 0;
      }
      bytes += geometry.index?.array?.byteLength ?? 0;
    }
    const materials = Array.isArray(renderable.material)
      ? renderable.material
      : renderable.material
        ? [renderable.material]
        : [];
    for (const material of materials) {
      for (const value of Object.values(material)) addTexture(value);
      const uniforms = (
        material as {
          uniforms?: Record<string, { value?: unknown }>;
        }
      ).uniforms;
      for (const uniform of Object.values(uniforms ?? {}))
        addTexture(uniform.value);
    }
  });
  addTexture(scene.background);
  addTexture(scene.environment);
  const pixels = viewport.width * viewport.height * viewport.dpr ** 2;
  return {
    bytes: bytes + Math.ceil(pixels * 32) + FIXED_RUNTIME_OVERHEAD_BYTES,
    skipReason,
  };
}
