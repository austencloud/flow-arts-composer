<script lang="ts">
  /**
   * StageTerrain
   *
   * Renders procedural terrain around the stage area within Scene3D.
   * The stage zone is a flat circular area at the center, surrounded by
   * forest terrain that players can walk into.
   *
   * This component manages:
   * - ChunkManager for procedural terrain generation
   * - VegetationManager for trees, rocks, bushes
   * - AtmosphereManager for sky and fog
   * - TerrainPhysicsManager for collision
   * - Stage ground collider for immediate physics
   */

  import { onMount, onDestroy } from "svelte";
  import { useThrelte } from "@threlte/core";
  import { ChunkManager, type ChunkState } from "#lib/shared/3d/procedural-engine/core/chunk-manager.js";
  import { VegetationManager } from "#lib/shared/3d/procedural-engine/rendering/instanced-vegetation.js";
  import { AtmosphereManager } from "#lib/shared/3d/procedural-engine/rendering/atmosphere.js";
  import { SeededNoise } from "#lib/shared/3d/procedural-engine/generation/seed-generator.js";
  import { TerrainPhysicsManager } from "#lib/shared/3d/physics/terrain-collider.js";
  import type { PhysicsWorldState } from "#lib/shared/3d/physics/types.js";
  import {
    BufferGeometry,
    BufferAttribute,
    Mesh,
    MeshStandardMaterial,
  } from "three";

  interface Props {
    /** Physics state for terrain colliders */
    physicsState: PhysicsWorldState | null;
    /** World seed for terrain generation */
    seed?: number;
    /** Stage zone radius (flat area) */
    stageRadius?: number;
    /** Stage zone blend width (transition to terrain) */
    stageBlendWidth?: number;
    /** Chunk size */
    chunkSize?: number;
    /** View distance */
    viewDistance?: number;
    /** Camera position for chunk streaming */
    cameraPosition?: { x: number; y: number; z: number };
  }

  let {
    physicsState,
    seed = 42,
    stageRadius = 15,
    stageBlendWidth = 10,
    chunkSize = 32,
    viewDistance = 256,
    cameraPosition = { x: 0, y: 0, z: 0 },
  }: Props = $props();

  const { scene } = useThrelte();

  // Managers
  let chunkManager: ChunkManager | null = $state(null);
  let vegetationManager: VegetationManager | null = $state(null);
  let atmosphereManager: AtmosphereManager | null = $state(null);
  let terrainPhysics: TerrainPhysicsManager | null = $state(null);

  // Track chunk meshes
  let chunkMeshes = new Map<string, Mesh>();

  // Initialization flag
  let isInitialized = $state(false);

  // Stage base height - must match the terrain worker's stageBaseHeight
  // This ensures the flat stage area aligns with the terrain base level
  const STAGE_HEIGHT = 5;

  onMount(async () => {
    // Create terrain physics manager if physics is available
    if (physicsState) {
      terrainPhysics = new TerrainPhysicsManager(physicsState);

      // Add immediate stage ground collider at the correct height
      terrainPhysics.addStageGroundCollider(0, 0, stageRadius + stageBlendWidth, STAGE_HEIGHT);
    }

    vegetationManager = new VegetationManager(scene, { useGLTFModels: true });
    await vegetationManager.initWithModels();

    atmosphereManager = new AtmosphereManager(scene);
    atmosphereManager.createSky();
    atmosphereManager.setFog("forest");

    chunkManager = new ChunkManager(seed, {
      chunkSize,
      viewDistance,
      lodDistances: [32, 64, 128, 256],
      maxConcurrentLoads: 4,
      resolution: 33,
    });

    // Set stage zone for terrain flattening
    chunkManager.setStageZone({ x: 0, z: 0 }, stageRadius, stageBlendWidth);

    chunkManager.onChunkLoaded = (key, state) => {
      if (state.meshData) {
        createChunkMesh(state, key);

        const chunk = state.entity.chunk;
        if (chunk && terrainPhysics) {
          terrainPhysics.addChunkCollider(
            chunk.chunkX,
            chunk.chunkZ,
            chunkSize,
            state.meshData
          );
        }

        if (chunk && vegetationManager && state.meshData.vegetation.length > 0) {
          const chunkWorldX = chunk.chunkX * chunkSize;
          const chunkWorldZ = chunk.chunkZ * chunkSize;
          vegetationManager.addChunkVegetation(
            key,
            chunkWorldX,
            chunkWorldZ,
            state.meshData.vegetation
          );
        }
      }
    };

    chunkManager.onChunkUnloaded = (key) => {
      const mesh = chunkMeshes.get(key);
      if (mesh) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        if (mesh.material instanceof MeshStandardMaterial) {
          mesh.material.dispose();
        }
        chunkMeshes.delete(key);
      }

      // Remove terrain collider
      const parts = key.split(",").map(Number);
      const chunkX = parts[0] ?? 0;
      const chunkZ = parts[2] ?? 0;
      terrainPhysics?.removeChunkCollider(chunkX, chunkZ);

      vegetationManager?.removeChunkVegetation(key);
    };

    isInitialized = true;

    // Initial chunk update
    chunkManager.update(cameraPosition.x, cameraPosition.y, cameraPosition.z);
  });

  onDestroy(() => {
    // Dispose chunk meshes
    for (const [key, mesh] of chunkMeshes) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      if (mesh.material instanceof MeshStandardMaterial) {
        mesh.material.dispose();
      }
    }
    chunkMeshes.clear();

    // Dispose managers
    chunkManager?.dispose();
    vegetationManager?.dispose();
    atmosphereManager?.dispose();
    terrainPhysics?.dispose();
  });

  // Update chunks when camera moves
  $effect(() => {
    if (isInitialized && chunkManager) {
      chunkManager.update(cameraPosition.x, cameraPosition.y, cameraPosition.z);
    }
  });

  // Rebuild vegetation batches periodically
  $effect(() => {
    if (isInitialized && vegetationManager) {
      vegetationManager.rebuildDirtyBatches();
    }
  });

  function createChunkMesh(state: ChunkState, key: string): void {
    if (!state.meshData) return;

    const { vertices, normals, colors, indices } = state.meshData;

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(vertices, 3));
    geometry.setAttribute("normal", new BufferAttribute(normals, 3));
    geometry.setAttribute("color", new BufferAttribute(colors, 3));
    geometry.setIndex(new BufferAttribute(indices, 1));

    const material = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.8,
      metalness: 0.1,
    });

    const mesh = new Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.castShadow = true;

    const chunk = state.entity.chunk;
    if (chunk) {
      mesh.position.set(
        chunk.chunkX * chunkSize,
        0,
        chunk.chunkZ * chunkSize
      );
    }

    scene.add(mesh);
    chunkMeshes.set(key, mesh);
  }
</script>

<!-- This component doesn't render any Threlte elements directly -->
<!-- It manages Three.js objects through the scene reference -->
