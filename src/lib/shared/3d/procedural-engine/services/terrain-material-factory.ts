import type {
  MeshStandardMaterial} from "three";
import {
  BufferGeometry,
  BufferAttribute,
  Mesh,
  type Material,
  type Scene,
} from "three";
import {
  loadTerrainTextures,
  createTerrainTextureMaterial,
  createTerrainFallbackMaterial,
  disposeTerrainTextures,
} from "../rendering/terrain-texture-material";
import type { ChunkState } from "../core/chunk-manager";

export interface TerrainMaterialFactory {
  getCurrentMaterial(): Material;
  init(useTexturing: boolean): Promise<void>;
  updateAllMeshes(chunkMeshes: Map<string, Mesh>, texturesEnabled: boolean): void;
  createChunkMesh(
    state: ChunkState,
    key: string,
    chunkSize: number,
    scene: Scene,
    chunkMeshes: Map<string, Mesh>,
    texturesEnabled: boolean
  ): void;
  dispose(): void;
  readonly isLoaded: boolean;
}

export function createTerrainMaterialFactory(): TerrainMaterialFactory {
  let texturedMaterial: Material | null = null;
  let fallbackMaterial: Material | null = null;
  let loaded = false;

  function getCurrentMaterial(texturesEnabled = true): Material {
    if (texturesEnabled && texturedMaterial) {
      return texturedMaterial;
    }
    if (!fallbackMaterial) {
      fallbackMaterial = createTerrainFallbackMaterial();
    }
    return fallbackMaterial;
  }

  async function init(useTexturing: boolean): Promise<void> {
    if (!useTexturing || loaded) return;

    try {
      const textures = await loadTerrainTextures();
      texturedMaterial = createTerrainTextureMaterial(textures, {
        textureScale: 0.05,
        triplanarSharpness: 4.0,
        normalStrength: 1.0,
      });
      loaded = true;
    } catch (error) {
      console.warn("[TerrainMaterialFactory] Failed to load textures, using vertex colors:", error);
      loaded = true;
    }
  }

  function updateAllMeshes(chunkMeshes: Map<string, Mesh>, texturesEnabled: boolean): void {
    const material = getCurrentMaterial(texturesEnabled);
    for (const mesh of chunkMeshes.values()) {
      mesh.material = material;
    }
  }

  function createChunkMesh(
    state: ChunkState,
    key: string,
    chunkSize: number,
    scene: Scene,
    chunkMeshes: Map<string, Mesh>,
    texturesEnabled: boolean
  ): void {
    if (!state.meshData) return;

    const { vertices, normals, colors, indices, blendWeights1, blendWeights2 } = state.meshData;

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(vertices, 3));
    geometry.setAttribute("normal", new BufferAttribute(normals, 3));
    geometry.setAttribute("color", new BufferAttribute(colors, 3));
    geometry.setIndex(new BufferAttribute(indices, 1));

    if (blendWeights1 && blendWeights2) {
      geometry.setAttribute("blendWeights1", new BufferAttribute(blendWeights1, 3));
      geometry.setAttribute("blendWeights2", new BufferAttribute(blendWeights2, 3));
    }

    const chunk = state.entity.chunk;
    const chunkWorldX = chunk ? Math.round(chunk.chunkX * chunkSize) : 0;
    const chunkWorldZ = chunk ? Math.round(chunk.chunkZ * chunkSize) : 0;

    const material = getCurrentMaterial(texturesEnabled);

    const mesh = new Mesh(geometry, material);
    // Terrain receives the avatar's and props' shadows but does not cast:
    // hills shading themselves inside the sun's 50 m shadow frustum are rarely
    // visible and were the largest share of the shadow pass.
    mesh.receiveShadow = true;
    mesh.castShadow = false;

    if (chunk) {
      mesh.position.set(chunkWorldX, 0, chunkWorldZ);
    }

    scene.add(mesh);
    chunkMeshes.set(key, mesh);

    state.entity.mesh = {
      object3D: mesh,
      visible: true,
      castShadow: false,
      receiveShadow: true,
    };
  }

  function dispose(): void {
    disposeTerrainTextures();
    if (fallbackMaterial) {
      (fallbackMaterial as MeshStandardMaterial).dispose?.();
      fallbackMaterial = null;
    }
    if (texturedMaterial) {
      (texturedMaterial as MeshStandardMaterial).dispose?.();
      texturedMaterial = null;
    }
  }

  return {
    getCurrentMaterial: (texturesEnabled?: boolean) => getCurrentMaterial(texturesEnabled),
    init,
    updateAllMeshes,
    createChunkMesh,
    dispose,
    get isLoaded() { return loaded; },
  };
}
