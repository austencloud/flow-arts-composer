<script module lang="ts">
  // Module-scoped GLTFLoader - shared across all instances so models survive
  // realm navigation/remount without re-fetching from the network.
  import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
  import { attachGltfDecoders } from "../../scene-boot/gltf-decoders";
  export const gltfLoader = new GLTFLoader();
  attachGltfDecoders(gltfLoader);
</script>

<script lang="ts">
  /**
   * WorldSceneContent
   *
   * Inner component that runs inside the Threlte Canvas context.
   * Handles physics initialization, chunk streaming, vegetation, atmosphere,
   * and integrates with UnifiedCameraController for full avatar parity.
   */

  import { onMount, onDestroy, getContext } from "svelte";
  import { T, useTask, useThrelte } from "@threlte/core";
  import { R2_CDN } from "../../constants/r2-cdn";

  // Physics
  import {
    createPhysicsWorldState,
    initPhysicsWorld,
    disposePhysicsWorld,
  } from "#lib/shared/3d/physics/rapier-world.js";
  import type {
    PhysicsWorldState,
    PlayerControllerState,
  } from "#lib/shared/3d/physics/types.js";
  import { TerrainPhysicsManager } from "#lib/shared/3d/physics/terrain-collider.js";
  import {
    createPlayerController,
    disposePlayerController,
  } from "#lib/shared/3d/physics/player-controller.js";
  import {
    createRapierPhysicsProvider,
    RapierPhysicsProvider,
  } from "#lib/shared/3d/physics/rapier-physics-provider.js";
  import type {
    PhysicsProvider,
    AvatarState,
  } from "#lib/shared/3d/camera/types.js";

  // Unified camera system
  import { UnifiedCameraController, CameraMode } from "@austencloud/camera-3d";
  import { cameraPreferences } from "#lib/shared/3d/camera/camera-preferences.svelte.js";

  // Avatar components
  import { Avatar3D } from "@austencloud/scene-3d";
  import { Prop3D } from "@austencloud/scene-3d";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import Grid3D from "#lib/shared/3d/components/Grid3D.svelte";
  import { Plane } from "@austencloud/scene-3d";

  // World systems
  import { type ChunkState } from "../core/chunk-manager";
  import {
    createHybridChunkManager,
    type HybridChunkManager,
  } from "../core/hybrid-chunk-manager";
  import { SeededNoise } from "../generation/seed-generator";
  import { type ImportedTerrainData } from "../generation/real-terrain-zone";
  import { VegetationManager } from "../rendering/instanced-vegetation";
  import { AtmosphereManager } from "../rendering/atmosphere";
  import { WaterManager } from "../rendering/water";
  import { DrainageWaterManager } from "../rendering/drainage-water";
  import type { RealmConfig } from "../core/world-config";

  // Museum
  import { createMuseumState } from "#lib/shared/museum/state/museum-state.svelte.js";
  import { setActiveMuseumState } from "#lib/shared/museum/state/museum-state-bridge.svelte.js";

  // Archive realm (ARCHIVE_WING1_CONFIG) - procedural indoor scene via IndoorScene.
  // (The standalone archive feature module was deleted Jun 2026; museum supersedes it.)

  import {
    Mesh,
    MeshStandardMaterial,
    DirectionalLight,
    AmbientLight,
    HemisphereLight,
    Object3D,
    Raycaster,
    Vector3,
    Matrix3,
    type Scene,
  } from "three";
  import type { RaycastResult } from "#lib/shared/3d/debug/game-bridge-types.js";

  // Terrain material + game loop services
  import { createTerrainMaterialFactory } from "../services/terrain-material-factory";
  import {
    tickWorldGameLoop,
    type GameLoopContext,
    type GameLoopState,
  } from "../services/world-game-loop";
  import { toScenePropType } from "#lib/shared/3d/domain/scene-prop-type.js";
  import { attachKtx2Decoder } from "../../scene-boot/gltf-decoders";

  // The module-scoped loader gets its geometry decoders at import time, but the
  // texture decoder has to ask a live renderer what the GPU supports — so it is
  // attached here, where this component's canvas context exists. Idempotent: the
  // hook hands back one shared loader no matter how often a realm remounts.
  attachKtx2Decoder(gltfLoader);

  // Feature flag for terrain texturing system
  // Set to true to enable PBR terrain textures (grass, rock, dirt, sand)
  // Set to false to use simple vertex colors (faster, fallback)
  const USE_TERRAIN_TEXTURING = true;


  interface Props {
    activeConfig: RealmConfig;
    worldSeed: number;
    worldNoise: SeededNoise;
    autoLoadRealTerrain: boolean;

    /** Enable stage mode - flat performance area with grid planes */
    stageMode?: boolean;

    // Bindable state (passed up to parent)
    physicsState: PhysicsWorldState | null;
    terrainPhysics: TerrainPhysicsManager | null;
    playerController: PlayerControllerState | null;
    physicsProvider: PhysicsProvider | null;
    vegetationManager: VegetationManager | null;
    atmosphereManager: AtmosphereManager | null;
    waterManager: WaterManager | null;
    chunkManager: HybridChunkManager | null;
    chunkMeshes: Map<string, Mesh>;
    playerPosition: { x: number; y: number; z: number };
    playerYaw: number;
    cameraMode: CameraMode;
    fps: number;
    frameCount: number;
    fpsTime: number;
    chunkStats: { loaded: number; pending: number; loading: number };
    colliderCount: number;
    vegetationCount: {
      trees: number;
      rocks: number;
      bushes: number;
      grass: number;
    };
    currentBiome: string;
    hannonsLoaded: boolean;
    zoneBounds: {
      minX: number;
      maxX: number;
      minZ: number;
      maxZ: number;
    } | null;
    zoneBoundary: Array<{ x: number; z: number }>;
    isInsideZone: boolean;
    showTouchUI: boolean;
    joystickInput: { x: number; z: number };

    avatarState: AvatarState;
    showAvatar: boolean;
    showGridPlanes: boolean;
    inputCapabilities: ReturnType<
      typeof import("#lib/shared/input/InputCapabilities.svelte.js").getInputCapabilities
    >;
    onModeChange: (mode: CameraMode) => void;

    /** Toggle terrain textures on/off (bindable) */
    terrainTexturesEnabled: boolean;

    /** Game-bridge raycast (AI debug). Bound out to the parent so WorldScene's
     *  bridge binding can cast rays against this scene's camera + graph, which
     *  only exist inside the Threlte canvas. Null until mounted. */
    bridgeRaycast?:
      | ((
          origin?: { x: number; y: number; z: number },
          direction?: { x: number; y: number; z: number },
          maxDistance?: number
        ) => RaycastResult)
      | null;

    /** Performer state for sequence playback (optional) */
    performerState?:
      | import("#lib/shared/3d/state/character-instance-state.svelte.js").CharacterInstanceState
      | null;

    /** Validated real-world terrain data for Earth destinations.
     *  The engine does not know about specific destinations - callers
     *  import the manifest and pass it in. Required when autoLoadRealTerrain is true. */
    terrainData?: ImportedTerrainData | null;
  }

  let {
    activeConfig,
    worldSeed,
    worldNoise,
    autoLoadRealTerrain,
    stageMode = false,

    physicsState = $bindable(),
    terrainPhysics = $bindable(),
    playerController = $bindable(),
    physicsProvider = $bindable(),
    vegetationManager = $bindable(),
    atmosphereManager = $bindable(),
    waterManager = $bindable(),
    chunkManager = $bindable(),
    chunkMeshes = $bindable(),
    playerPosition = $bindable(),
    playerYaw = $bindable(),
    cameraMode = $bindable(),
    fps = $bindable(),
    frameCount = $bindable(),
    fpsTime = $bindable(),
    chunkStats = $bindable(),
    colliderCount = $bindable(),
    vegetationCount = $bindable(),
    currentBiome = $bindable(),
    hannonsLoaded = $bindable(),
    zoneBounds = $bindable(),
    zoneBoundary = $bindable(),
    isInsideZone = $bindable(),
    showTouchUI = $bindable(),
    joystickInput = $bindable(),

    avatarState,
    showAvatar,
    showGridPlanes,
    inputCapabilities,
    onModeChange,
    terrainTexturesEnabled = $bindable(true),
    bridgeRaycast = $bindable(null),
    performerState = null,
    terrainData = null,
  }: Props = $props();

  const { scene, camera, renderer } = useThrelte();

  // Access the raw Three.js Scene directly from Threlte's internal context.
  // useThrelte().scene is a Svelte 5 reactive wrapper ({ current: Scene }) whose
  // .current property is undefined during onMount (signal hasn't propagated yet).
  // The scene context stores the raw Scene object without any wrapper.
  const threlteSceneCtx = getContext<{ scene: Scene }>("threlte-scene-context");
  const rawScene: Scene = threlteSceneCtx.scene;

  // ── Game-bridge raycast (AI debug) ──────────────────────────────────────
  // Reused across calls so the debug bridge allocates nothing per query.
  const _rayCaster = new Raycaster();
  const _rayOrigin = new Vector3();
  const _rayDir = new Vector3();
  const _rayNormalMat = new Matrix3();
  const _rayNormal = new Vector3();
  function sceneRaycast(
    origin?: { x: number; y: number; z: number },
    direction?: { x: number; y: number; z: number },
    maxDistance = 100
  ): RaycastResult {
    const cam = camera.current;
    // Default to a camera ray ("what the viewer is looking at").
    if (origin) {
      _rayOrigin.set(origin.x, origin.y, origin.z);
    } else if (cam) {
      _rayOrigin.copy(cam.position);
    } else {
      return { hit: false };
    }
    if (direction) {
      _rayDir.set(direction.x, direction.y, direction.z).normalize();
    } else if (cam) {
      cam.getWorldDirection(_rayDir);
    } else {
      return { hit: false };
    }

    _rayCaster.set(_rayOrigin, _rayDir);
    _rayCaster.far = maxDistance;
    const hits = _rayCaster.intersectObjects(rawScene.children, true);
    const first = hits.find((h) => h.object.visible);
    if (!first) return { hit: false };

    const p = first.point;
    let normal: { x: number; y: number; z: number } | undefined;
    if (first.face) {
      _rayNormalMat.getNormalMatrix(first.object.matrixWorld);
      _rayNormal
        .copy(first.face.normal)
        .applyMatrix3(_rayNormalMat)
        .normalize();
      normal = { x: _rayNormal.x, y: _rayNormal.y, z: _rayNormal.z };
    }
    return {
      hit: true,
      point: { x: p.x, y: p.y, z: p.z },
      normal,
      distance: first.distance,
      objectId: first.object.uuid,
      objectType: first.object.name || first.object.type,
    };
  }
  // Publish to the parent (WorldScene) which owns the game-bridge binding.
  bridgeRaycast = sceneRaycast;

  // Grid plane sets
  // Stage mode: all three planes (wall, wheel, floor)
  // Open world: just floor plane
  const stagePlaneSet = new Set([Plane.WALL, Plane.WHEEL, Plane.FLOOR]);
  const floorPlaneSet = new Set([Plane.FLOOR]);
  const activePlaneSet = $derived(stageMode ? stagePlaneSet : floorPlaneSet);


  let isInitialized = $state(false);
  let isReadyToRender = $state(false); // True after ground snap - prevents showing underground
  let needsGroundSnap = true; // Snap to ground once terrain loads
  let groundSnapAttempts = 0; // Track attempts to avoid infinite loops
  const MAX_GROUND_SNAP_ATTEMPTS = 300; // ~5 seconds at 60fps

  // Flag to prevent physics operations during/after cleanup
  // This prevents Rapier WASM errors during HMR when the module is partially freed
  let isDisposed = false;
  let hannonsLoadTimer: ReturnType<typeof setTimeout> | null = null;

  // Campground objects placed in spawn clearing
  let campgroundObjects: Object3D[] = [];

  // Museum state (created once, only used when museum realm is active)
  const isMuseumRealm = $derived(activeConfig.id === "museum-grounds");
  const museumState = createMuseumState();

  // Publish museum state to bridge so MuseumDestination can access it for HTML overlays
  $effect(() => {
    setActiveMuseumState(isMuseumRealm ? museumState : null);
    return () => setActiveMuseumState(null);
  });

  // Archive realm detection (used for camera/lighting adjustments when in archive zone)
  const isArchiveRealm = $derived(activeConfig.id === "archive-wing1");

  // Sun light reference for shadow updates
  let sunLight: DirectionalLight | null = null;

  // Drainage-based water manager (per-chunk water that follows terrain topology)
  let drainageWaterManager: DrainageWaterManager | null = null;

  // NOTE: Clipmap material is disabled until T-junction stitching is implemented.
  // The GPU vertex morphing only works if adjacent chunks have the same vertex
  // count at their shared edge, which requires stitching geometry.
  // For now, LOD 0 + 15m skirts provides seamless terrain.

  onMount(async () => {
    inputCapabilities.init();

    physicsState = createPhysicsWorldState();
    await initPhysicsWorld(physicsState, {
      x: 0,
      y: -activeConfig.physics.gravity,
      z: 0,
    });

    terrainPhysics = new TerrainPhysicsManager(physicsState);

    // Add immediate ground collider for spawn clearing or stage zone
    // This prevents falling through before terrain chunks load
    const waterLevel = activeConfig.terrain.waterLevel ?? 5;
    if (activeConfig.spawnClearing?.enabled) {
      // Spawn clearing: ground is above water level
      const clearingHeight = waterLevel + 3;
      terrainPhysics.addStageGroundCollider(
        activeConfig.spawnClearing.center.x,
        activeConfig.spawnClearing.center.z,
        activeConfig.spawnClearing.radius +
          activeConfig.spawnClearing.blendWidth,
        clearingHeight
      );
    } else if (stageMode && activeConfig.stageZone?.enabled) {
      // Legacy stage zone: ground at Y=0
      terrainPhysics.addStageGroundCollider(
        0,
        0, // Center at origin
        activeConfig.stageZone.radius + activeConfig.stageZone.blendWidth
      );
    }

    // Create player controller - start high, ground snap happens in game loop once terrain loads
    const spawnPos = activeConfig.spawn.position;
    playerController = createPlayerController(physicsState, {
      position: { x: spawnPos[0], y: 500, z: spawnPos[2] }, // Start very high
    });

    // Create physics provider for UnifiedCameraController
    physicsProvider = createRapierPhysicsProvider(
      physicsState,
      playerController
    );

    // Initialize position (will be updated when ground snap happens)
    playerPosition = { x: spawnPos[0], y: 500, z: spawnPos[2] };

    // Setup lighting (rawScene is available since Canvas creates it before mounting children)
    setupLighting();

    // Initialize terrain textures (async, non-blocking)
    // Chunks render with vertex colors initially, textures applied when loaded
    initTerrainMaterial();

    // Skip outdoor environment systems for indoor scenes (archive cave)
    if (!isArchiveRealm) {
      vegetationManager = new VegetationManager(rawScene, {
        useGLTFModels: true,
      });
      await vegetationManager.initWithModels();

      // Initialize atmosphere (sky, fog)
      atmosphereManager = new AtmosphereManager(rawScene);
      atmosphereManager.createSky();
      atmosphereManager.setFog(stageMode ? "forest" : "plains");

      // Initialize water (flat plane that follows camera - legacy fallback)
      waterManager = new WaterManager(rawScene, {
        waterLevel: 5,
        color: "#2a8faa",
        opacity: 0.75,
      });
      waterManager.create();

      // Initialize drainage-based water (per-chunk water that follows terrain)
      drainageWaterManager = new DrainageWaterManager(rawScene, {
        oceanLevel: activeConfig.terrain.waterLevel ?? -10,
        deepColor: "#1a5f7a",
        shallowColor: "#4a9fb5",
      });
    }

    // Skip terrain chunk generation for indoor scenes (archive cave)
    // Indoor scenes only need the physics ground collider, not terrain meshes
    if (!isArchiveRealm) {
      // GPU compute is disabled until Three.js WebGPU compute API stabilizes
      // (readStorageBufferAsync API changed in recent versions)
      chunkManager = createHybridChunkManager(worldSeed, {
        chunkSize: activeConfig.chunks.size,
        viewDistance: activeConfig.chunks.viewDistance,
        lodDistances: activeConfig.chunks.lodDistances,
        maxConcurrentLoads: 4,
        resolution: 33,
        useGPU: false, // Disabled - WebGPU compute API needs update
      });

      // T-junction stitching is implemented in the chunk worker (CPU-side).
      // Edge vertices are adjusted to match coarser neighbor LODs during generation.
      // No GPU vertex morphing needed - we use standard materials.

      // CRITICAL: Set spawn clearing BEFORE any chunks are generated
      // This must happen immediately after chunk manager is created
      if (activeConfig.spawnClearing?.enabled) {
        const clearing = activeConfig.spawnClearing;
        const waterLvl = activeConfig.terrain.waterLevel ?? 5;
        chunkManager.setSpawnClearing(
          clearing.center,
          clearing.radius,
          clearing.blendWidth,
          waterLvl,
          clearing.campground
        );
        // Logging disabled - was contributing to console spam
      }

      // Skip processing during disposal to prevent Rapier WASM errors
      chunkManager.onChunkLoaded = (key, state) => {
        if (isDisposed) return;

        if (state.meshData) {
          createChunkMesh(state, key);

          // Create terrain collider (wrapped in try-catch for HMR safety)
          const chunk = state.entity.chunk;
          const chunkSize = activeConfig.chunks.size;
          if (chunk && terrainPhysics) {
            try {
              terrainPhysics.addChunkCollider(
                chunk.chunkX,
                chunk.chunkZ,
                chunkSize,
                state.meshData
              );
            } catch (e) {
              if (import.meta.hot) {
                console.debug(
                  "[WorldSceneContent] Chunk collider creation failed (likely HMR):",
                  e
                );
              }
            }
          }

          // Add vegetation (filter out items in water areas)
          if (
            chunk &&
            vegetationManager &&
            state.meshData.vegetation.length > 0
          ) {
            const chunkWorldX = Math.round(chunk.chunkX * chunkSize);
            const chunkWorldZ = Math.round(chunk.chunkZ * chunkSize);

            // Filter vegetation to exclude water areas
            let filteredVegetation = state.meshData.vegetation;
            if (state.meshData.drainage?.waterMask) {
              const resolution = 33;
              const step = chunkSize / (resolution - 1);
              const waterMask = state.meshData.drainage.waterMask;

              filteredVegetation = state.meshData.vegetation.filter((veg) => {
                // Convert vegetation world position to grid index
                const localX = veg.x - chunkWorldX;
                const localZ = veg.z - chunkWorldZ;
                const gridX = Math.round(localX / step);
                const gridZ = Math.round(localZ / step);
                const clampedX = Math.max(0, Math.min(resolution - 1, gridX));
                const clampedZ = Math.max(0, Math.min(resolution - 1, gridZ));
                const idx = clampedZ * resolution + clampedX;

                // Keep vegetation only if waterMask is below threshold
                const water = waterMask[idx] ?? 0;
                return water < 0.3;
              });
            }

            vegetationManager.addChunkVegetation(
              key,
              chunkWorldX,
              chunkWorldZ,
              filteredVegetation
            );
          }

          // Create drainage-based water for this chunk
          if (chunk && drainageWaterManager && state.meshData.drainage) {
            const resolution = 33; // Same as chunk generator
            const mainVertexCount = resolution * resolution; // 1089 vertices (excludes skirts)

            // Extract heights from main terrain vertices only (not skirts)
            // Skirts are appended after the main grid, so first mainVertexCount vertices are the grid
            const heights = new Float32Array(mainVertexCount);
            for (let i = 0; i < mainVertexCount; i++) {
              heights[i] = state.meshData.vertices[i * 3 + 1]!;
            }
            drainageWaterManager.createChunkWater(
              chunk.chunkX,
              chunk.chunkZ,
              chunkSize,
              resolution,
              state.meshData.drainage,
              heights
            );
          }
        }
      };

      // Skip cleanup during disposal to prevent Rapier WASM errors
      chunkManager.onChunkUnloaded = (key) => {
        if (isDisposed) return;

        const mesh = chunkMeshes.get(key);
        if (mesh) {
          rawScene.remove(mesh);
          mesh.geometry.dispose();
          if (mesh.material instanceof MeshStandardMaterial) {
            mesh.material.dispose();
          }
          chunkMeshes.delete(key);
        }

        // Remove terrain collider (wrapped in try-catch for HMR safety)
        const parts = key.split(",").map(Number);
        const chunkX = parts[0] ?? 0;
        const chunkZ = parts[2] ?? 0;
        try {
          terrainPhysics?.removeChunkCollider(chunkX, chunkZ);
        } catch (e) {
          if (import.meta.hot) {
            console.debug(
              "[WorldSceneContent] Chunk collider removal failed (likely HMR):",
              e
            );
          }
        }

        vegetationManager?.removeChunkVegetation(key);

        drainageWaterManager?.removeChunkWater(chunkX, chunkZ);
      };
    } // end: skip terrain chunks for archive

    isInitialized = true;

    // DEBUG: expose archive state to console for diagnostics (remove after debugging)
    if (isArchiveRealm) {
      (window as any).__archiveDebug = {
        get isInitialized() {
          return isInitialized;
        },
        get isReadyToRender() {
          return isReadyToRender;
        },
        get needsGroundSnap() {
          return needsGroundSnap;
        },
        get groundSnapAttempts() {
          return groundSnapAttempts;
        },
        get physicsProvider() {
          return !!physicsProvider;
        },
        get playerController() {
          return !!playerController;
        },
        get playerPosition() {
          return playerPosition;
        },
        get cameraMode() {
          return cameraMode;
        },
        get colliderCount() {
          return terrainPhysics?.getColliderCount() ?? -1;
        },
        get isArchiveRealm() {
          return isArchiveRealm;
        },
        get scene() {
          return rawScene;
        },
        get camera() {
          return camera.current;
        },
      };
      // Debug state exposed on window.__archiveDebug
    }

    // Place campground objects (spawn clearing was already set above)
    if (
      activeConfig.spawnClearing?.enabled &&
      activeConfig.spawnClearing.campground.enabled
    ) {
      const waterLvl = activeConfig.terrain.waterLevel ?? 5;
      await placeCampgroundObjects(activeConfig.spawnClearing, waterLvl);
    }
    // Legacy: Initialize stage zone if configured and no spawn clearing
    else if (stageMode && activeConfig.stageZone?.enabled && chunkManager) {
      chunkManager.setStageZone(
        { x: 0, z: 0 }, // Stage at origin
        activeConfig.stageZone.radius,
        activeConfig.stageZone.blendWidth
      );
      // Logging disabled
    }

    // Auto-load terrain if configured
    if (activeConfig.terrain.type === "real-terrain" || autoLoadRealTerrain) {
      hannonsLoadTimer = setTimeout(() => loadRealTerrain(), 100);
    }
  });

  onDestroy(() => {
    // Mark as disposed FIRST to prevent useTask from accessing freed resources
    isDisposed = true;

    if (hannonsLoadTimer !== null) {
      clearTimeout(hannonsLoadTimer);
      hannonsLoadTimer = null;
    }

    // Dispose chunk meshes
    for (const [key, mesh] of chunkMeshes) {
      rawScene.remove(mesh);
      mesh.geometry.dispose();
      if (mesh.material instanceof MeshStandardMaterial) {
        mesh.material.dispose();
      }
    }
    chunkMeshes.clear();

    // Dispose campground objects
    for (const obj of campgroundObjects) {
      rawScene.remove(obj);
    }
    campgroundObjects = [];

    // Dispose managers (non-physics)
    chunkManager?.dispose();
    vegetationManager?.dispose();
    atmosphereManager?.dispose();
    waterManager?.dispose();
    drainageWaterManager?.dispose();

    // Dispose terrain material factory
    terrainMaterialFactory.dispose();

    // Dispose physics-related resources
    // Wrapped in try-catch because during HMR, Rapier's WASM module may already
    // be freed before our cleanup runs, causing "_initialized" errors
    try {
      terrainPhysics?.dispose();

      if (physicsState && playerController) {
        disposePlayerController(physicsState, playerController);
      }

      if (physicsState) {
        disposePhysicsWorld(physicsState);
      }
    } catch (e) {
      // Expected during HMR when Rapier WASM is already freed
      if (import.meta.hot) {
        console.debug("[WorldSceneContent] Rapier cleanup during HMR:", e);
      }
    }

    inputCapabilities.destroy();
  });


  // Outdoor lighting references (disabled for indoor scenes like the archive)
  let outdoorAmbient: AmbientLight | null = null;
  let outdoorHemisphere: HemisphereLight | null = null;

  function setupLighting(): void {
    // Ambient light
    const ambient = new AmbientLight(0x404060, isArchiveRealm ? 0 : 0.4);
    rawScene.add(ambient);
    outdoorAmbient = ambient;

    // Hemisphere light (sky + ground)
    const hemisphere = new HemisphereLight(
      0x87ceeb,
      0x3d5c3d,
      isArchiveRealm ? 0 : 0.6
    );
    rawScene.add(hemisphere);
    outdoorHemisphere = hemisphere;

    // Sun with standard directional light shadows
    // Shadow frustum follows player for infinite terrain coverage
    const sun = new DirectionalLight(0xffffff, isArchiveRealm ? 0 : 1.0);
    sun.position.set(100, 200, 100);
    sun.castShadow = !isArchiveRealm;

    // Shadow map settings - larger map for quality
    sun.shadow.mapSize.width = 1024;
    sun.shadow.mapSize.height = 1024;

    // Shadow camera frustum - covers area around player
    // Will be updated each frame to follow player position
    const shadowSize = 50; // 50m radius around player
    sun.shadow.camera.left = -shadowSize;
    sun.shadow.camera.right = shadowSize;
    sun.shadow.camera.top = shadowSize;
    sun.shadow.camera.bottom = -shadowSize;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 500;

    // Bias to prevent shadow acne
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;

    rawScene.add(sun);
    sun.target.position.set(0, 0, 0);
    rawScene.add(sun.target);
    sunLight = sun;
  }


  /**
   * Load a GLTF model and add it to the scene
   */
  async function loadAndPlaceModel(
    path: string,
    x: number,
    y: number,
    z: number,
    rotationY: number = 0,
    scale: number = 1
  ): Promise<Object3D | null> {
    try {
      const gltf = await gltfLoader.loadAsync(path);
      const model = gltf.scene;
      model.position.set(x, y, z);
      model.rotation.y = rotationY;
      model.scale.setScalar(scale);
      model.castShadow = true;
      model.receiveShadow = true;
      // Enable shadows on all children
      model.traverse((child) => {
        if (child instanceof Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      rawScene.add(model);
      campgroundObjects.push(model);
      return model;
    } catch (error) {
      console.warn(`[WorldSceneContent] Failed to load model ${path}:`, error);
      return null;
    }
  }

  /**
   * Place campground objects in the spawn clearing
   */
  async function placeCampgroundObjects(
    clearing: NonNullable<typeof activeConfig.spawnClearing>,
    waterLevel: number
  ): Promise<void> {
    const { center, campground } = clearing;
    const groundY = waterLevel + 3; // Clearing is 3m above water

    // Logging disabled

    // Model paths (R2 CDN)
    const MODELS = {
      firePit: `${R2_CDN}/models/camping/campfire-pit.glb`,
      tent: `${R2_CDN}/models/camping/tent-canvas.glb`,
      log: `${R2_CDN}/models/camping/tree-log.glb`,
      logSmall: `${R2_CDN}/models/camping/tree-log-small.glb`,
    };

    // Fire pit at center
    if (campground.firePit) {
      await loadAndPlaceModel(
        MODELS.firePit,
        center.x,
        groundY,
        center.z,
        0,
        1.5
      );
    }

    // Tent offset from center
    if (campground.tent) {
      await loadAndPlaceModel(
        MODELS.tent,
        center.x - 8,
        groundY,
        center.z - 5,
        Math.PI * 0.25, // Face toward fire
        1.2
      );
    }

    // Log seats around fire
    if (campground.seatingLogs > 0) {
      const logPositions = [
        { x: center.x + 3, z: center.z + 2, rot: -Math.PI * 0.3 },
        { x: center.x - 2, z: center.z + 4, rot: -Math.PI * 0.6 },
        { x: center.x + 1, z: center.z - 3, rot: Math.PI * 0.4 },
        { x: center.x + 4, z: center.z - 1, rot: Math.PI * 0.1 },
      ];

      const logsToPlace = Math.min(campground.seatingLogs, logPositions.length);
      for (let i = 0; i < logsToPlace; i++) {
        const pos = logPositions[i];
        if (pos) {
          await loadAndPlaceModel(
            i % 2 === 0 ? MODELS.log : MODELS.logSmall,
            pos.x,
            groundY,
            pos.z,
            pos.rot,
            0.8
          );
        }
      }
    }

    // Torches at perimeter (not implemented yet - would need torch model)
    // if (campground.torches > 0) {
    //   TODO: Add torch models when available
    // }
  }

  // ============================================================================
  // CHUNK MESH CREATION
  // ============================================================================

  const terrainMaterialFactory = createTerrainMaterialFactory();

  async function initTerrainMaterial(): Promise<void> {
    await terrainMaterialFactory.init(USE_TERRAIN_TEXTURING);
    if (terrainTexturesEnabled) {
      terrainMaterialFactory.updateAllMeshes(chunkMeshes, true);
    }
  }

  // React to texture toggle changes
  $effect(() => {
    terrainMaterialFactory.updateAllMeshes(chunkMeshes, terrainTexturesEnabled);
  });

  function createChunkMesh(state: ChunkState, key: string): void {
    terrainMaterialFactory.createChunkMesh(
      state,
      key,
      activeConfig.chunks.size,
      rawScene,
      chunkMeshes,
      terrainTexturesEnabled
    );
  }

  // ============================================================================
  // TERRAIN LOADING
  // ============================================================================

  function loadRealTerrain(): void {
    if (!chunkManager) return;
    if (!terrainData) {
      console.warn(
        "[WorldSceneContent] real terrain config has no validated terrainData"
      );
      return;
    }

    const boundary = terrainData.boundary;
    let minX = Infinity,
      maxX = -Infinity;
    let minZ = Infinity,
      maxZ = -Infinity;

    for (const p of boundary) {
      minX = Math.min(minX, p.worldX);
      maxX = Math.max(maxX, p.worldX);
      minZ = Math.min(minZ, p.worldZ);
      maxZ = Math.max(maxZ, p.worldZ);
    }

    zoneBounds = { minX, maxX, minZ, maxZ };
    zoneBoundary = boundary.map((p) => ({ x: p.worldX, z: p.worldZ }));

    chunkManager.loadRealTerrainZone(terrainData);
    hannonsLoaded = true;

    // Logging disabled
  }

  // ============================================================================
  // GAME LOOP (via Threlte useTask)
  // ============================================================================

  useTask((delta) => {
    if (!physicsState || !playerController) return;

    const loopCtx: GameLoopContext = {
      physicsState,
      playerController,
      terrainPhysics,
      chunkManager,
      vegetationManager,
      atmosphereManager,
      waterManager,
      drainageWaterManager,
      sunLight,
      camera,
      activeConfig,
      worldNoise,
      inputCapabilities,
      museumState,
      isMuseumRealm,
    };

    const loopState: GameLoopState = {
      isDisposed,
      isInitialized,
      needsGroundSnap,
      groundSnapAttempts,
      isReadyToRender,
      frameCount,
      fpsTime,
      fps,
      chunkStats,
      colliderCount,
      vegetationCount,
      showTouchUI,
      playerPosition,
      currentBiome,
      isInsideZone,
      zoneBoundary,
    };

    tickWorldGameLoop(delta, loopCtx, loopState);

    // Write back mutated state
    isDisposed = loopState.isDisposed;
    needsGroundSnap = loopState.needsGroundSnap;
    groundSnapAttempts = loopState.groundSnapAttempts;
    isReadyToRender = loopState.isReadyToRender;
    frameCount = loopState.frameCount;
    fpsTime = loopState.fpsTime;
    fps = loopState.fps;
    chunkStats = loopState.chunkStats;
    colliderCount = loopState.colliderCount;
    vegetationCount = loopState.vegetationCount;
    showTouchUI = loopState.showTouchUI;
    playerPosition = loopState.playerPosition;
    currentBiome = loopState.currentBiome;
    isInsideZone = loopState.isInsideZone;
  });
</script>

<!-- Default camera during loading -->
<!-- Indoor scenes (archive): camera inside the room. Outdoor: overhead view. -->
{#if !isReadyToRender}
  <T.PerspectiveCamera
    makeDefault
    position={isArchiveRealm ? [0, 9.7, 2] : [0, 25, 30]}
    fov={isArchiveRealm ? 70 : 60}
    near={0.1}
    far={10000}
    oncreate={(ref) => {
      if (isArchiveRealm) {
        ref.lookAt(0, 9.2, -5);
      } else {
        ref.lookAt(0, 8, 0);
      }
    }}
  />
{/if}

<!-- Unified Camera Controller with physics provider -->
<!-- Takes over once ground snap is complete and player is at correct position -->
{#if isInitialized && isReadyToRender && physicsProvider}
  <UnifiedCameraController
    destinationId={isArchiveRealm ? "archive" : "realm"}
    {avatarState}
    {physicsProvider}
    {cameraPreferences}
    enabled={true}
    initialYaw={playerYaw}
    onModeChange={(mode: CameraMode) => {
      cameraMode = mode;
      onModeChange(mode);
    }}
    onRotationChange={(newYaw: number, _pitch: number) => {
      playerYaw = newYaw;
    }}
  />
{/if}

<!-- Player Avatar (hidden in first-person mode) -->
<!-- Wait for isReadyToRender to prevent showing avatar at wrong position -->
{#if isInitialized && isReadyToRender && showAvatar}
  <Avatar3D
    id="realm-player"
    leftPropState={performerState?.leftPropState ?? null}
    rightPropState={performerState?.rightPropState ?? null}
    visible={true}
    position={playerPosition}
    facingAngle={playerYaw}
    isMoving={avatarState.isMoving}
    moveDirection={avatarState.moveDirection ?? { x: 0, z: 1 }}
  />

  <!-- Props when sequence is loaded - positioned via parent group -->
  <T.Group
    position.x={playerPosition.x}
    position.z={playerPosition.z}
    rotation.y={playerYaw}
  >
    <T.Group position.z={-0.5}>
      {#if performerState?.leftPropState}
        <T.Group
          position.x={performerState.leftPropState.worldPosition.x}
          position.y={performerState.leftPropState.worldPosition.y}
          position.z={performerState.leftPropState.worldPosition.z}
        >
          <Prop3D
            propType={toScenePropType(PropType.STAFF)}
            propState={performerState.leftPropState}
            color="blue"
            isActivePlayer={true}
          />
        </T.Group>
      {/if}
      {#if performerState?.rightPropState}
        <T.Group
          position.x={performerState.rightPropState.worldPosition.x}
          position.y={performerState.rightPropState.worldPosition.y}
          position.z={performerState.rightPropState.worldPosition.z}
        >
          <Prop3D
            propType={toScenePropType(PropType.STAFF)}
            propState={performerState.rightPropState}
            color="red"
            isActivePlayer={true}
          />
        </T.Group>
      {/if}
    </T.Group>
  </T.Group>
{/if}

<!-- Grid Planes (optional) -->
{#if isInitialized && isReadyToRender && showAvatar && showGridPlanes}
  <T.Group
    position.x={playerPosition.x}
    position.y={playerPosition.y}
    position.z={playerPosition.z}
    rotation.y={playerYaw}
  >
    <Grid3D visiblePlanes={activePlaneSet} />
  </T.Group>
{/if}

<!-- Museum Pavilions (only when museum realm is active) -->
{#if isMuseumRealm && isInitialized && isReadyToRender}
  {#await import("#lib/features/museum/scenes/procedural/components/MuseumGrounds.svelte") then mod}
    <mod.default
      {museumState}
      groundY={(activeConfig.terrain.waterLevel ?? 5) + 3}
      {playerPosition}
    />
  {/await}
{/if}

<!-- Archive realm: procedural indoor scene (ARCHIVE_WING1_CONFIG) via IndoorScene -->
