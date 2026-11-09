import {
  Color,
  type Material,
  type Mesh,
  type Object3D,
  type Texture,
} from "three";
import type { EnvironmentMaterialOptions } from "./environment-manifest";

/** A dressed copy of a GLB scene and the means to free what was copied. */
export interface DressedEnvironment {
  root: Object3D;
  /** Disposes the cloned materials only; geometry and textures stay shared. */
  dispose: () => void;
}

type ColouredMaterial = Material & {
  color?: Color;
  envMap?: Texture | null;
  envMapIntensity?: number;
};

/**
 * Applies a manifest's material corrections to a copy of a loaded GLB scene.
 *
 * `useGltf` caches by URL, so the scene it returns is the one every other
 * consumer of that file sees. The copy shares geometry and textures with the
 * cache but owns its node tree and its materials, which is where every
 * correction lands. A material shared by several meshes in the bake stays
 * shared in the copy, so draw-call batching is unchanged.
 *
 * `envMap` is the texture `materials.envMapIntensity` scales; it is owned by
 * the caller (the shared room texture) and never disposed here.
 */
export function dressEnvironmentMaterials(
  source: Object3D,
  options: EnvironmentMaterialOptions,
  envMap: Texture | null = null
): DressedEnvironment {
  const root = source.clone(true);
  const copies = new Map<Material, Material>();

  const dress = (material: Material): Material => {
    const existing = copies.get(material);
    if (existing) return existing;
    const copy = material.clone() as ColouredMaterial;
    if (options.vertexColors !== undefined) {
      copy.vertexColors = options.vertexColors;
    }
    if (options.tint && copy.color) {
      // Linear working-space values, as TrenchFloor's setRGB used them.
      copy.color.multiply(new Color(...options.tint));
    }
    if (options.envMapIntensity !== undefined && envMap) {
      copy.envMap = envMap;
      copy.envMapIntensity = options.envMapIntensity;
    }
    copy.needsUpdate = true;
    copies.set(material, copy);
    return copy;
  };

  root.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(dress)
      : dress(mesh.material);
  });

  return {
    root,
    dispose: () => {
      for (const copy of copies.values()) copy.dispose();
      copies.clear();
    },
  };
}
