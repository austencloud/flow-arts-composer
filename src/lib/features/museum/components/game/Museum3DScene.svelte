<script lang="ts">
  import { tick, untrack } from "svelte";
  import { T, useTask, useThrelte } from "@threlte/core";
  import { PCFSoftShadowMap } from "three";
  import { Vector3, Raycaster, Matrix3 } from "three";
  import type { BatchedMesh, Group, Object3D, PerspectiveCamera } from "three";
  import MuseumPostProcessing from "./MuseumPostProcessing.svelte";
  import type { MuseumGrid } from "../../domain/museum-grid-types";
  import type { RoomEdge } from "../../domain/layout-types";
  import { tileKey } from "../../domain/museum-grid-types";
  import {
    UnifiedCameraController,
    CameraMode,
    CAMERA_DEFAULTS,
  } from "@austencloud/camera-3d";
  import type { AvatarState } from "@austencloud/camera-3d";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import {
    createMuseumPhysicsProvider,
    MuseumPhysicsProvider,
  } from "../../services/museum-physics-provider";
  import { cameraPreferences } from "$lib/shared/3d/camera/camera-preferences.svelte";
  import MuseumFurniture from "./MuseumFurniture.svelte";
  import MuseumPerformerStation3D from "./MuseumPerformerStation3D.svelte";
  import VulcanCaveScenicLayer from "./VulcanCaveScenicLayer.svelte";
  import DrownedGalleryAuthored from "./DrownedGalleryAuthored.svelte";
  import FirstFireAuthored from "./FirstFireAuthored.svelte";
  import EarthRootTerraceAuthored from "./EarthRootTerraceAuthored.svelte";
  import AirChimneyGraybox from "./AirChimneyGraybox.svelte";
  import SundialGraybox from "./SundialGraybox.svelte";
  import MoonGraybox from "./MoonGraybox.svelte";
  import {
    buildMoonLayout,
    MOON_FLOOR_Y,
    MOON_GRAVITY_SCALE,
    MOON_ROOM_ID,
  } from "../../data/moon-layout";
  import { MUSEUM_GRAVITY } from "../../domain/museum-design-rules";
  import {
    buildSundialLayout,
    EYE_RADIUS_M,
    EYE_TOP_Y,
  } from "../../data/sundial-layout";
  import TelekineticFormation3D from "./TelekineticFormation3D.svelte";
  import { Avatar3D } from "@austencloud/scene-3d";
  import MuseumMirror from "./MuseumMirror.svelte";
  import MuseumPortal from "./MuseumPortal.svelte";
  import MuseumVillageEmbed from "./MuseumVillageEmbed.svelte";
  import { preloadVillageAvatarModels } from "../../services/museum-village-manager";
  import MuseumTorch3D from "./MuseumTorch3D.svelte";
  import GltfAsset from "$lib/shared/3d/environments/primitives/GltfAsset.svelte";
  import FallingParticles from "$lib/shared/3d/environments/primitives/FallingParticles.svelte";
  import SceneEffectsCoordinator3D from "$lib/shared/3d/effects/scene-effects/SceneEffectsCoordinator3D.svelte";
  import { SceneEffectsManager3D } from "$lib/shared/3d/effects/scene-effects/scene-effects-manager-3d";
  import { setSceneEffectsContext } from "$lib/shared/3d/effects/scene-effects/scene-effects-context";

  const sceneEffectsManager = setSceneEffectsContext(
    new SceneEffectsManager3D()
  );

  // Start preloading village avatar models immediately - they'll be cached
  // by the time the player reaches the Room of Collaboration
  preloadVillageAvatarModels();
  import {
    createTorchInstance,
    type TorchMaterials,
  } from "../../services/torch-material-cache";
  import { FIXTURE_REGISTRY } from "../../domain/fixture-registry";
  import MuseumPlaque3D from "./MuseumPlaque3D.svelte";
  import MuseumStickyNote3D from "./MuseumStickyNote3D.svelte";
  import MuseumCaseScreen3D from "./MuseumCaseScreen3D.svelte";
  import { placeFreeNotes } from "../../services/museum-free-notes";
  import { caveCaseCard } from "../../data/museum-narration";
  import MuseumSceneEditor from "./MuseumSceneEditor.svelte";
  import PlacementGhost from "../editor/PlacementGhost.svelte";
  import {
    preloadAllFixtureModels,
    addTorchToScene,
    removeTorchFromScene,
  } from "./MuseumTorch3D.svelte";
  import {
    createPortalConfig,
    PortalProximityChecker,
  } from "../../services/museum-portals";
  import { MuseumEditorPlacement } from "../../services/museum-editor-placement";
  import {
    blendAuthoredPointLightPool,
    blendRoomLightPool,
    createEmptyAuthoredPointLightPool,
    createEmptyPool,
    recomputeNearbyRoomLights as recomputeNearbyLightsFromPool,
    selectAuthoredPointLights,
    type AuthoredPointLightPlan,
    type AuthoredPointLightSlot,
    type RoomLightSlot,
  } from "../../services/museum-room-light-pool";
  import { MuseumAtmosphere } from "../../services/museum-atmosphere";
  import OrbitControls from "$lib/shared/3d/components/OrbitControls.svelte";
  import { museum3dEditorState } from "../../state/museum-3d-editor-state.svelte";
  import { museumEditorOverrides } from "../../state/museum-editor-overrides";
  import { generateCanvas as generatePlaqueCanvas } from "../../services/plaque-texture-generator";
  import type {
    RoomChunk,
    BatchedMeshData,
    PlaquePlacement,
    TorchPosition,
    LightPosition,
    RoomLight,
  } from "../../services/museum-geometry-builder";
  import { MUSEUM_EDGES } from "../../data/museum-room-graph";

  import { MuseumCameraFlipController } from "../../services/museum-camera-flip-controller";
  import type { CameraFlipState } from "../../services/museum-camera-flip-controller";
  import { MuseumGeometryStreamer } from "../../services/museum-geometry-streamer";
  import {
    MuseumProximityRenderer,
    PROXIMITY_MAX_MOUNTS_PER_FRAME,
  } from "../../services/museum-proximity-renderer";
  import { MuseumPlayerController } from "../../services/museum-player-controller";
  import { resolveScene, resolveRenderer } from "../resolve-threlte-scene";
  import { getMuseumPerformanceRecorder } from "../../get-museum-performance-recorder";

  // Plaque texture generation uses module-level cache (generatePlaqueCanvas)
  // Torch materials use module-level template compiled once on first createTorchInstance call
  const atmosphere = new MuseumAtmosphere();

  const threlteCtx = useThrelte();
  $effect(() => {
    const sc = resolveScene(threlteCtx);
    if (sc && sc.fog !== atmosphere.fog) sc.fog = atmosphere.fog;
  });

  // Enable shadow maps on the renderer
  $effect(() => {
    const renderer = resolveRenderer(threlteCtx);
    if (renderer && !renderer.shadowMap.enabled) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = PCFSoftShadowMap;
    }
  });

  // Facing direction string → yaw angle for performer stations
  const FACING_TO_YAW: Record<string, number> = {
    north: Math.PI,
    south: 0,
    east: Math.PI / 2,
    west: -Math.PI / 2,
  };

  interface Props {
    grid: MuseumGrid;
    /** Room graph edges used by the geometry streamer for authored corridors. */
    edges?: RoomEdge[];
    flipRequested: number;
    /** Keys currently held by the player (from parent's keyboard handler) */
    heldKeys?: Set<string>;
    /**
     * Analog movement from the touch joystick, −1..1 per axis, `z` forward.
     * The keyboard path is untouched; this is the only way to walk on a phone,
     * where `heldKeys` can never fill because there is no keyboard to fill it.
     */
    moveAxis?: { x: number; z: number };
    /** Top-down camera height above the player (controlled by parent for zoom) */
    topDownHeight?: number;
    /** Callback: fires every frame with the player's current world position + facing */
    onPlayerUpdate?: (
      worldX: number,
      worldZ: number,
      tileX: number,
      tileY: number,
      facing: string,
      inFPS: boolean,
      yaw: number
    ) => void;
    /** If true on mount, skip top-down init and go straight to FPS (used for HMR restore) */
    initialFpsActive?: boolean;
    /** Preferred game-camera mode when no route-specific preference has been saved. */
    initialCameraMode?: "first-person" | "third-person";
    /** Session-storage key used to isolate camera preferences between experiences. */
    cameraModePersistenceKey?: string;
    /** Override spawn position (used for HMR restore) */
    initialPlayerPos?: { x: number; z: number };
    /** Override initial yaw (used for HMR restore) */
    initialPlayerYaw?: number;
    /** Increment to teleport player back to spawn */
    resetRequested?: number;
    /** Increment to trigger instant first-person → third-person switch */
    modeChangeRequested?: number;
    /** Called once on the first rendered frame - signals the 3D scene is interactive */
    onReady?: () => void;
    /** Called when view mode changes between first-person and third-person */
    onViewModeChange?: (mode: "first-person" | "third-person") => void;
    /** Called during async geometry build with the current phase name */
    onBuildStage?: (stage: string) => void;
    /** Called when async geometry build completes - all meshes are ready to render */
    onGeometryReady?: () => void;
    /** True once every tracked GLTF and texture has settled. */
    assetsReady?: boolean;
    /** Called after FPS-only objects share the final entrance light program. */
    onShaderWarmupReady?: () => void;
    /** Fires when the camera crosses the terrain waterline (underwater state). */
    onSubmergedChange?: (submerged: boolean) => void;
    /** False when the museum is mounted-but-hidden (keep-alive) - pause per-frame work */
    visible?: boolean;
    /**
     * Optional injection map for resolving performer/formation sequenceIds to a
     * user's PRIVATE library sequence (personal-museum reuse). Threaded down to
     * MuseumPerformerStation3D + TelekineticFormation3D, checked there BEFORE
     * MUSEUM_EXHIBIT_SEQUENCES. Undefined in the official museum (default).
     */
    userSequenceData?: Map<string, SequenceData>;
    /**
     * Optional per-refId pictograph bitmaps composited into wall plaques
     * (personal-museum slots). Pre-rendered async via renderFirstStepBitmap.
     * Undefined in the official museum → text-only plaques, cache intact.
     */
    plaquePictographs?: Map<string, ImageBitmap>;
  }

  const props: Props = $props();
  const performanceRecorder = getMuseumPerformanceRecorder();

  // Keep-alive: request a repaint when the scene becomes visible again, so it
  // shows the current frame immediately on resume (render loop was paused while
  // hidden). invalidate is a no-op under continuous render but harmless.
  $effect(() => {
    if (props.visible !== false) (threlteCtx as any).invalidate?.();
  });

  // Resolve initial-value props as plain consts (used once at init, not reactive)
  const grid = props.grid;
  const initialFpsActive = props.initialFpsActive ?? false;
  const initialPlayerPos = props.initialPlayerPos;
  const initialPlayerYaw = props.initialPlayerYaw;
  const onReady = props.onReady;

  // ── Tile scale: each tile = 0.5m in world space ──
  const TILE_SIZE = 0.5;

  // Tile geometry owns walkability and collision. These room-authored GLBs add
  // trim, fixtures, and environmental detail without changing the floor plan.
  const authoredRooms = grid.wings.flatMap((wing) => {
    // A presentation without a modelPath (e.g. suppressTileGeometry-only rooms
    // dressed by a graybox layer) has no authored GLB to mount.
    if (!wing.roomPresentation?.modelPath) return [];
    const presentation = wing.roomPresentation;
    const centerX = (wing.bounds.x + (wing.bounds.width - 1) / 2) * TILE_SIZE;
    const centerZ = (wing.bounds.y + (wing.bounds.height - 1) / 2) * TILE_SIZE;
    return [
      {
        id: wing.id,
        presentation: presentation as typeof presentation & {
          modelPath: string;
        },
        position: [centerX, 0, centerZ] as [number, number, number],
        atmospherePosition: [centerX, 2.1, centerZ] as [number, number, number],
        atmosphereArea: {
          width: Math.max(TILE_SIZE, (wing.bounds.width - 2) * TILE_SIZE),
          height: 4,
          depth: Math.max(TILE_SIZE, (wing.bounds.height - 2) * TILE_SIZE),
        },
      },
    ];
  });
  const lobbyPresentation = authoredRooms.find(({ id }) => id === "lobby");
  const hasLobbyPresentation = lobbyPresentation !== undefined;
  const hasVulcanCaveSlice = grid.wings.some(
    (wing) => wing.id === "cave-water"
  );
  // The Drowned Gallery route renders from its authored Blender shell plus the
  // walk-side water, pedestals and consoles (see DrownedGalleryAuthored.svelte).
  // The graybox that preceded it is gone; this flag now gates the authored mount.
  /** Longest the entrance shader warm-up may hold the museum's ready flag. */
  const ENTRANCE_WARMUP_CAP_MS = 8000;

  const hasDrownedGallery = grid.wings.some(
    (wing) => wing.id === "cave-water-gallery"
  );
  // Graybox for The First Fire. Remove with the component when its authored
  // GLB shell lands, the way the Drowned Gallery's graybox went.
  const hasFirstFire = grid.wings.some((wing) => wing.id === "cave-fire");
  // The Earth wing (the Root Terrace) owns its shell and its stations.
  const hasEarthTerrace = grid.wings.some((wing) => wing.id === "cave-earth");
  const hasAirChimney = grid.wings.some((wing) => wing.id === "cave-air");
  // Graybox for the Sundial (the Sun Chamber). Same lifetime again.
  const hasSundial = grid.wings.some((wing) => wing.id === "cave-sun");
  // Graybox for the Moon. Same lifetime again.
  const hasMoon = grid.wings.some((wing) => wing.id === MOON_ROOM_ID);
  const moonLayout = hasMoon ? buildMoonLayout(grid) : null;
  const sundialLayout = hasSundial ? buildSundialLayout(grid) : null;

  // ── Progressive mount: break heavy sub-components into stages so the
  // browser can paint between each batch. Without this, mounting all torches,
  // plaques, performers etc. in one frame blocks the main thread for ~6-9s.

  // ── Editor overrides: sync dragged world positions back into grid data ──
  // Bumping this counter triggers Svelte reactivity for performer/exhibit positions.
  let overrideVersion = $state(0);

  /**
   * Called by MuseumSceneEditor after any drag/undo/redo. Converts world-space
   * overrides back to tile coordinates and patches grid.performers / grid.exhibits
   * so the tile-based interaction system uses the new positions.
   */
  function applyEditorOverrides() {
    const allOverrides = museumEditorOverrides.getAll();

    for (const performer of grid.performers) {
      const override = allOverrides[`performer-station-${performer.id}`];
      if (override) {
        const oldKey = tileKey(performer.tileX, performer.tileY);
        const newTX = Math.round(override.x / TILE_SIZE);
        const newTY = Math.round(override.z / TILE_SIZE);
        const newKey = tileKey(newTX, newTY);

        // Move the interactable tile entry so the proximity check works
        if (oldKey !== newKey) {
          const oldTile = grid.tiles.get(oldKey);
          if (oldTile?.type === "performer-station") {
            grid.tiles.delete(oldKey);
            grid.tiles.set(newKey, { ...oldTile });
          }
        }

        performer.tileX = newTX;
        performer.tileY = newTY;
      }
    }

    for (const exhibit of grid.exhibits) {
      const override = allOverrides[`plaque-${exhibit.id}`];
      if (override) {
        const oldKey = tileKey(exhibit.tileX, exhibit.tileY);
        const newTX = Math.round(override.x / TILE_SIZE);
        const newTY = Math.round(override.z / TILE_SIZE);
        const newKey = tileKey(newTX, newTY);

        // Move the interactable tile entry
        if (oldKey !== newKey) {
          const oldTile = grid.tiles.get(oldKey);
          if (oldTile?.type === "exhibit-panel") {
            grid.tiles.delete(oldKey);
            grid.tiles.set(newKey, { ...oldTile, refId: exhibit.id });
          }
        }

        exhibit.tileX = newTX;
        exhibit.tileY = newTY;
      }
    }

    for (const furn of grid.furniture ?? []) {
      const override = allOverrides[`furniture-${furn.id}`];
      if (override) {
        furn.tileX = Math.round(override.x / TILE_SIZE);
        furn.tileY = Math.round(override.z / TILE_SIZE);
      }
    }

    // No batched performer mesh to sync - MuseumPerformerStation3D handles its own position

    // Bump version to trigger reactive re-reads of performer/exhibit positions
    overrideVersion++;
  }

  // Preload all fixture GLTF models when entering editor mode so the ghost
  // preview shows the real model and placement is instant (synchronous clone).
  $effect(() => {
    if (museum3dEditorState.editorActive) {
      preloadAllFixtureModels();
    }
  });

  function getSceneObj() {
    return resolveScene(threlteCtx);
  }

  const editorPlacement = new MuseumEditorPlacement(
    grid,
    TILE_SIZE,
    getSceneObj,
    {
      add: addTorchToScene,
      remove: removeTorchFromScene,
    }
  );

  // Apply any persisted overrides on mount (from previous editor sessions).
  // Must use untrack: applyEditorOverrides reads+writes grid.performers/exhibits
  // which are reactive - without untrack this creates an infinite effect loop.
  let editorOverridesApplied = false;
  $effect(() => {
    if (editorOverridesApplied) return;
    editorOverridesApplied = true;
    untrack(() => {
      const all = museumEditorOverrides.getAll();
      if (Object.keys(all).length > 0) {
        applyEditorOverrides();
      }
    });
  });

  import type { WingTheme } from "../../domain/museum-grid-types";

  // Wall height - used for ceiling light placement in the template
  const WALL_HEIGHT = 4.5;

  // ── Camera ──
  let camera: PerspectiveCamera | undefined = $state();
  let playerAvatarWarmupGroup: Group | undefined = $state();
  let resolvePlayerAvatarReady: (() => void) | undefined;
  const playerAvatarReady = new Promise<void>((resolve) => {
    resolvePlayerAvatarReady = resolve;
  });
  // Reused scratch vector for reading the editor-orbit target on each
  // change event. Avoids per-frame Vector3 allocations.
  const _editorTargetVec = new Vector3();

  function handlePlayerAvatarReady(): void {
    // Avatar3D reports readiness immediately before its Threlte object mounts.
    // Defer one microtask so the hidden preview wrapper contains the model.
    queueMicrotask(() => {
      resolvePlayerAvatarReady?.();
      resolvePlayerAvatarReady = undefined;
    });
  }

  // ── Game-bridge raycast (AI debug: "what am I looking at / what's at X") ──
  // Reused across calls so the debug bridge doesn't allocate a Raycaster +
  // scratch vectors per query.
  const _rayCaster = new Raycaster();
  const _rayOrigin = new Vector3();
  const _rayDir = new Vector3();
  const _rayNormalMat = new Matrix3();
  const _rayNormal = new Vector3();
  function bridgeRaycast(
    origin?: { x: number; y: number; z: number },
    direction?: { x: number; y: number; z: number },
    maxDistance = 100
  ): import("$lib/shared/3d/debug/game-bridge-types").RaycastResult {
    const scene = resolveScene(threlteCtx);
    if (!scene) return { hit: false };

    // Default to a camera ray ("what the viewer is looking at") when no
    // explicit origin/direction is supplied.
    if (origin) {
      _rayOrigin.set(origin.x, origin.y, origin.z);
    } else if (camera) {
      _rayOrigin.copy(camera.position);
    } else {
      return { hit: false };
    }
    if (direction) {
      _rayDir.set(direction.x, direction.y, direction.z).normalize();
    } else if (camera) {
      camera.getWorldDirection(_rayDir);
    } else {
      return { hit: false };
    }

    _rayCaster.set(_rayOrigin, _rayDir);
    _rayCaster.far = maxDistance;
    const hits = _rayCaster.intersectObjects(scene.children, true);
    const first = hits.find((h) => h.object.visible);
    if (!first) return { hit: false };

    const p = first.point;
    // face.normal is in geometry-local space; transform to world space so the
    // returned normal actually describes the surface orientation in the scene.
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

  // Grid metrics
  const maxExtent = Math.max(grid.width, grid.height) * TILE_SIZE;
  const spawnWorldX = initialPlayerPos?.x ?? grid.spawn.x * TILE_SIZE;
  const spawnWorldZ = initialPlayerPos?.z ?? grid.spawn.y * TILE_SIZE;
  const spawnYaw = initialPlayerYaw ?? FACING_TO_YAW[grid.spawn.facing] ?? 0;

  // ── Portal system ──
  const portalConfig = createPortalConfig(grid, TILE_SIZE);
  const portalChecker = new PortalProximityChecker(portalConfig.pairs);

  // ── Extracted controllers ──
  const cameraFlip = new MuseumCameraFlipController(
    spawnWorldX,
    spawnWorldZ,
    props.topDownHeight ?? 12
  );

  // ── Flip animation state ──
  let flipState: CameraFlipState = {
    progress: initialFpsActive ? 1 : 0,
    animating: false,
    goingDown: true,
    initialized: false,
    lastFlipCount: 0,
  };
  let animating = $state(false);

  // ── FPS mode: active when flip animation has completed (progress=1) ──
  // UnifiedCameraController takes over camera when this is true.
  let fpsActive = $state(initialFpsActive);

  // Track the user's preferred 3D camera mode so flipping back to 3D restores it.
  const CAMERA_MODE_HMR_KEY =
    props.cameraModePersistenceKey ?? "museum-last-camera-mode";
  function loadLastCameraMode(): CameraMode {
    try {
      const raw = sessionStorage.getItem(CAMERA_MODE_HMR_KEY);
      if (raw === "THIRD_PERSON") return CameraMode.THIRD_PERSON;
      if (raw === "FIRST_PERSON") return CameraMode.FIRST_PERSON;
    } catch {
      /* sessionStorage unavailable */
    }
    return props.initialCameraMode === "third-person"
      ? CameraMode.THIRD_PERSON
      : CameraMode.FIRST_PERSON;
  }
  let lastCameraMode: CameraMode = $state(loadLastCameraMode());

  // Avatar state for UnifiedCameraController (follows the established pattern)
  // Yaw and pitch persist across flip cycles so the player's view direction is restored.
  let playerYaw = $state(spawnYaw);
  let targetPlayerYaw = $state(spawnYaw);
  let playerPitch = $state(0);

  // External rotation override for the game bridge (AI debug). When set to a
  // number, UCC adopts it as the current yaw/pitch (one-shot on change — the
  // user can still look around with the pointer afterward). Null = no override.
  let externalYaw = $state<number | null>(null);
  let externalPitch = $state<number | null>(null);

  // Snapshot of yaw/pitch at the moment we enter FPS mode.
  // Passed as initialYaw/initialPitch to UCC - these must NOT update while UCC is mounted,
  // or UCC's $effect.pre will reset yaw/pitch every frame, creating a feedback loop.
  let fpsInitialYaw = $state(spawnYaw);
  let fpsInitialPitch = $state(0);
  let isMoving = $state(false);
  let isCrouching = $state(false);
  let playerSpeed = $state(0);
  let moveDir = $state({ x: 0, z: 0 });
  let playerPosition = $state({ x: spawnWorldX, y: 0, z: spawnWorldZ });
  const portalsVisible = $derived.by(() => {
    if (!portalConfig.caveWing || !portalConfig.galleryWing) return false;
    const maxDistanceSq = 15 * 15;
    return [portalConfig.bluePos, portalConfig.orangePos].some((position) => {
      const dx = position[0] - playerPosition.x;
      const dz = position[2] - playerPosition.z;
      return dx * dx + dz * dz <= maxDistanceSq;
    });
  });
  let playerGrounded = $state(true);
  let playerVerticalVelocity = $state(0);

  /**
   * Low gravity on the Moon, and only there. It starts on the first step OFF
   * the arrival plinth rather than on arrival: the plinth is the Sun's stone
   * and still behaves like it, so stepping across that seam is the moment the
   * room announces itself. `isLowGravityAt` owns that boundary — this only
   * asks it.
   *
   * The museum's normal figure now lives in museum-design-rules as
   * MUSEUM_GRAVITY, shared with every graybox review route so a route can
   * never review the museum in a different body.
   */
  let playerJumpRequested = $state(false);

  // Detect jump input on the EXACT frame Space is pressed - no physics delay.
  // The UCC processes the same keypress for physics; we just need the signal
  // to reach the animation state machine on the same frame.
  $effect(() => {
    function onJumpKey(e: KeyboardEvent) {
      if (e.code === "Space" && fpsActive && playerGrounded) {
        playerJumpRequested = true;
        // Clear after one full animation frame so Avatar3D's update loop reads it
        requestAnimationFrame(() => {
          playerJumpRequested = false;
        });
      }
    }
    window.addEventListener("keydown", onJumpKey);
    return () => window.removeEventListener("keydown", onJumpKey);
  });
  const ROTATION_SPEED = 12;

  const avatarState: AvatarState = {
    get position() {
      return playerPosition;
    },
    get facingAngle() {
      return playerYaw;
    },
    get isMoving() {
      return isMoving;
    },
    get isCrouching() {
      return isCrouching;
    },
    set isCrouching(v: boolean) {
      isCrouching = v;
    },
    get moveDirection() {
      return moveDir;
    },
    setMoveInput(input: { x: number; z: number }) {
      moveDir = input;
      isMoving = input.x !== 0 || input.z !== 0;
    },
    updateMovement(_delta: number, _cameraAngle: number) {
      // Handled by physics provider
    },
    setFacingAngle(angle: number) {
      targetPlayerYaw = angle;
    },
    snapFacingAngle(angle: number) {
      playerYaw = angle;
      targetPlayerYaw = angle;
    },
    updateLocomotion(delta: number) {
      let diff = targetPlayerYaw - playerYaw;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      if (Math.abs(diff) < 0.01) {
        playerYaw = targetPlayerYaw;
      } else {
        const maxStep = ROTATION_SPEED * delta;
        playerYaw += Math.sign(diff) * Math.min(Math.abs(diff), maxStep);
      }
    },
  };

  // Physics provider for grid-based wall collision
  const physicsProvider = createMuseumPhysicsProvider(grid, TILE_SIZE, {
    x: spawnWorldX,
    y: 0,
    z: spawnWorldZ,
  }) as MuseumPhysicsProvider;

  // Player controller - handles movement, portals, void recovery
  const playerCtrl = new MuseumPlayerController(
    grid,
    TILE_SIZE,
    physicsProvider,
    portalChecker
  );

  // Root motion disabled - code-driven movement for responsive controls.
  // The root motion infrastructure is preserved for future A/B testing.
  // To re-enable: set rootMotionEnabled = fpsActive and enableRootMotion={true} on Avatar3D.

  // Initialize FPS target at spawn (must be after physicsProvider is created).
  // untrack prevents reactive tracking — this is a one-shot init, not a live binding.
  $effect(() => {
    untrack(() => {
      cameraFlip.syncFpsFromPlayer(
        physicsProvider.getPlayerPosition(),
        playerYaw,
        playerPitch,
        camera
      );
    });
  });

  // Simple wing theme lookup - used once per frame for atmosphere transitions.
  // Not performance-critical (the hot path tile→theme lookup is in MuseumGeometryBuilder).
  function getWingThemeAt(tileX: number, tileY: number): WingTheme | null {
    for (const wing of grid.wings) {
      const b = wing.bounds;
      if (
        tileX >= b.x &&
        tileX < b.x + b.width &&
        tileY >= b.y &&
        tileY < b.y + b.height
      ) {
        return wing.theme;
      }
    }
    return null;
  }

  // ── Atmospheric updates: fog smoothly transitions per wing ──
  // (Ambient light is now per-room static PointLights from the geometry builder)

  function updateAtmosphere(tileX: number, tileZ: number, delta: number): void {
    const theme = getWingThemeAt(tileX, tileZ);
    // The Moon is the one room in the museum standing outside, on a body with
    // no air. See MuseumAtmosphere.update's `vacuum`.
    atmosphere.update(
      theme,
      fpsActive,
      delta,
      currentPlayerRoomId === MOON_ROOM_ID
    );
  }

  /**
   * The Sun's eye, delivered.
   *
   * The eye is an updraft at the centre of the Sundial that carries the visitor
   * up the chamber. It always stopped at the ceiling and left them pinned there
   * — Austen: *"when it lifts me up it does not actually lift me through the
   * ground of the moon ... it just smooshes me towards the ceiling."* The ride
   * was the whole mechanism and it had no other end.
   *
   * It has one now: at the top of the column the visitor surfaces on the Moon's
   * arrival plinth, which is the Sun's own stone carried up through the
   * regolith, facing the plain with the three stations ahead of them. Both
   * rooms already agreed about that shaft — the Moon's hole is sized off this
   * eye — so nothing new is invented here, only the last metre of the journey.
   */
  function handleEyeLift(x: number, y: number, z: number): boolean {
    if (!sundialLayout || !moonLayout) return false;
    const dx = x - sundialLayout.centre.x;
    const dz = z - sundialLayout.centre.z;
    if (dx * dx + dz * dz > EYE_RADIUS_M * EYE_RADIUS_M) return false;
    // A hair below the top, so the arrival fires while the column is still
    // pushing rather than after it has given up and left the visitor hanging.
    if (y < EYE_TOP_Y - 0.35) return false;

    const arrival = moonLayout.arrival;
    physicsProvider.teleport!({ x: arrival.x, y: MOON_FLOOR_Y, z: arrival.z });
    syncPositionFromPhysics();
    // Facing the chamber centre: the arrival sits west of it on purpose, so the
    // stations are ahead of the visitor rather than behind them.
    const yaw = Math.atan2(
      moonLayout.centre.x - arrival.x,
      moonLayout.centre.z - arrival.z
    );
    playerYaw = yaw;
    targetPlayerYaw = yaw;
    fpsInitialYaw = yaw;
    fpsInitialPitch = 0;
    fpsActive = false;
    requestAnimationFrame(() => {
      fpsActive = true;
      flipState.progress = 1;
    });
    return true;
  }

  /** Handle portal teleport — updates reactive state for yaw/pitch/fps reset */
  function handlePortalTeleport(playerX: number, playerZ: number): boolean {
    const hit = portalChecker.check(playerX, playerZ);
    if (!hit) return false;
    physicsProvider.teleport!({ x: hit.destX, y: 0, z: hit.destZ });
    syncPositionFromPhysics();
    playerYaw = hit.destYaw;
    targetPlayerYaw = hit.destYaw;
    fpsInitialYaw = hit.destYaw;
    fpsInitialPitch = 0;
    fpsActive = false;
    requestAnimationFrame(() => {
      fpsActive = true;
      flipState.progress = 1;
    });
    return true;
  }

  /** Sync playerPosition and top-down camera to where the physics provider says the player is */
  function syncPositionFromPhysics(): void {
    const pos = physicsProvider.getPlayerPosition();
    playerPosition.x = pos.x;
    playerPosition.y = pos.y;
    playerPosition.z = pos.z;
    cameraFlip.snapTopDownToPlayer(pos);
  }

  // ── Waterline submersion ──
  // Eye height is position.y + 0.75 (UCC first-person offset). Rooms without a
  // terrain program never call the callback, so every other museum surface pays
  // one boolean check per frame.
  let wasSubmerged = false;
  function updateSubmersion(): void {
    const terrain = grid.terrain;
    if (!terrain || !props.onSubmergedChange) return;
    const eyeY = physicsProvider.getPlayerPosition().y + 0.75;
    const submerged = eyeY < terrain.waterlineY;
    if (submerged !== wasSubmerged) {
      wasSubmerged = submerged;
      props.onSubmergedChange(submerged);
    }
  }

  // ── Flip animation loop ──
  // When fpsActive, UnifiedCameraController owns the camera - we don't touch it.
  useTask((delta) => {
    if (!camera) return;

    // Keep-alive: pause per-frame scene work while hidden (no movement, no
    // streaming, no atmosphere). One-time camera init/onReady already ran on the
    // first visible frame, since the keep-alive host only mounts museum when active.
    if (props.visible === false) return;

    const framePosition = physicsProvider.getPlayerPosition();
    performanceRecorder.recordFrame(delta * 1_000, {
      roomId: geometryStreamer.currentPlayerRoomId,
      cameraMode: museum3dEditorState.editorActive
        ? "editor"
        : fpsActive
          ? lastCameraMode === CameraMode.THIRD_PERSON
            ? "third-person"
            : "first-person"
          : "top-down",
      position: {
        x: framePosition.x,
        y: framePosition.y,
        z: framePosition.z,
      },
      activeRooms: geometryStreamer.activeRoomChunks.size,
      pendingMounts: pendingMounts.length,
    });

    // In editor mode, OrbitControls owns the camera - skip all movement/animation
    if (museum3dEditorState.editorActive) return;

    // Drain pending mount queue (max per frame to avoid spikes)
    if (pendingMounts.length > 0) {
      const mountStartedAt = performanceRecorder.beginPhase();
      const batch = pendingMounts.splice(0, PROXIMITY_MAX_MOUNTS_PER_FRAME);
      for (const mount of batch) {
        switch (mount.category) {
          case "plaque":
            visiblePlaques = [...visiblePlaques, mount.item];
            break;
          case "performer":
            visiblePerformers = [...visiblePerformers, mount.item];
            break;
          case "exhibitLight":
            visibleExhibitLights = [...visibleExhibitLights, mount.item];
            break;
          case "ceilingLight":
            visibleCeilingLights = [...visibleCeilingLights, mount.item];
            break;
          case "sunlight":
            visibleSunlights = [...visibleSunlights, mount.item];
            break;
          case "furniture":
            visibleFurniture = [...visibleFurniture, mount.item];
            break;
        }
      }
      performanceRecorder.endPhase(
        "frame.mount-reactive-objects",
        mountStartedAt
      );
    }

    // Proximity visibility recheck - when player moves 2+ tiles
    const proximityStartedAt = performanceRecorder.beginPhase();
    const currentTX = Math.round(playerPosition.x / TILE_SIZE);
    const currentTY = Math.round(playerPosition.z / TILE_SIZE);
    if (proximityRenderer.shouldRecompute(currentTX, currentTY)) {
      proximityRenderer.recomputeVisibility(currentTX, currentTY);
    }

    // Waterline crossing (runs before the mode-specific early returns below)
    updateSubmersion();
    performanceRecorder.endPhase("frame.proximity", proximityStartedAt);

    // First frame: initialize camera
    if (!flipState.initialized) {
      flipState.initialized = true;
      if (initialFpsActive) {
        cameraPreferences.setModeForDestination("museum", lastCameraMode);
        cameraFlip.syncFpsFromPlayer(
          physicsProvider.getPlayerPosition(),
          playerYaw,
          playerPitch,
          camera
        );
      }
      cameraFlip.initializeCamera(camera, initialFpsActive);
      onReady?.();
      return;
    }

    // If FPS mode is active, UCC owns the camera - skip everything
    if (fpsActive) {
      // Delegate to player controller for position sync, void recovery, portal check
      const movementStartedAt = performanceRecorder.beginPhase();
      const fpsResult = playerCtrl.syncFpsPosition();
      if (
        handleEyeLift(
          fpsResult.position.x,
          fpsResult.position.y,
          fpsResult.position.z
        )
      ) {
        const corrected = physicsProvider.getPlayerPosition();
        fpsResult.position.x = corrected.x;
        fpsResult.position.y = corrected.y;
        fpsResult.position.z = corrected.z;
      }
      if (fpsResult.portalHit) {
        // Portal teleport needs to update reactive state
        if (handlePortalTeleport(fpsResult.position.x, fpsResult.position.z)) {
          // handlePortalTeleport already did the teleport and state update
          const corrected = physicsProvider.getPlayerPosition();
          fpsResult.position.x = corrected.x;
          fpsResult.position.y = corrected.y;
          fpsResult.position.z = corrected.z;
        }
      }

      // Sync reactive state for Avatar3D's animation system
      playerSpeed = fpsResult.speed;
      playerGrounded = fpsResult.grounded;
      playerVerticalVelocity = fpsResult.velocity.y;
      performanceRecorder.endPhase("frame.movement", movementStartedAt);

      const fpsTileX = Math.round(fpsResult.position.x / TILE_SIZE);
      const fpsTileZ = Math.round(fpsResult.position.z / TILE_SIZE);
      const atmosphereStartedAt = performanceRecorder.beginPhase();
      updateAtmosphere(fpsTileX, fpsTileZ, delta);
      performanceRecorder.endPhase("frame.atmosphere", atmosphereStartedAt);
      const streamingStartedAt = performanceRecorder.beginPhase();
      geometryStreamer.updateStreaming(fpsTileX, fpsTileZ, fpsActive);
      syncPlayerRoomFromStreamer();
      performanceRecorder.endPhase("frame.streaming", streamingStartedAt);
      const publishStartedAt = performanceRecorder.beginPhase();
      props.onPlayerUpdate?.(
        fpsResult.position.x,
        fpsResult.position.z,
        fpsTileX,
        fpsTileZ,
        playerCtrl.yawToFacing(playerYaw),
        true,
        playerYaw
      );
      performanceRecorder.endPhase("frame.publish-player", publishStartedAt);
      return;
    }

    // Detect new flip request (must check before movement/animation branches)
    flipState = cameraFlip.checkFlipRequest(
      props.flipRequested ?? 0,
      flipState,
      physicsProvider.getPlayerPosition(),
      playerYaw,
      playerPitch,
      camera
    );
    animating = flipState.animating;

    // ── Top-down WASD movement (when not animating) ──
    if (!animating) {
      const movementStartedAt = performanceRecorder.beginPhase();
      const keys = props.heldKeys ?? new Set<string>();
      const moveResult = playerCtrl.updateTopDownMovement(
        keys,
        delta,
        playerYaw
      );
      playerSpeed = moveResult.speed;
      playerYaw = moveResult.playerYaw;

      if (moveResult.teleported) {
        // Portal hit in top-down: use handlePortalTeleport for reactive state
        handlePortalTeleport(moveResult.position.x, moveResult.position.z);
        const corrected = physicsProvider.getPlayerPosition();
        moveResult.position.x = corrected.x;
        moveResult.position.y = corrected.y;
        moveResult.position.z = corrected.z;
      }

      playerPosition.x = moveResult.position.x;
      playerPosition.y = moveResult.position.y;
      playerPosition.z = moveResult.position.z;

      // Smooth camera follow + zoom
      cameraFlip.updateTopDownFollow(
        camera,
        moveResult.position,
        props.topDownHeight ?? 12
      );
      performanceRecorder.endPhase("frame.movement", movementStartedAt);

      // Report to parent
      const tileX = Math.round(moveResult.position.x / TILE_SIZE);
      const tileZ = Math.round(moveResult.position.z / TILE_SIZE);
      const atmosphereStartedAt = performanceRecorder.beginPhase();
      updateAtmosphere(tileX, tileZ, delta);
      performanceRecorder.endPhase("frame.atmosphere", atmosphereStartedAt);
      const streamingStartedAt = performanceRecorder.beginPhase();
      geometryStreamer.updateStreaming(tileX, tileZ, fpsActive);
      syncPlayerRoomFromStreamer();
      performanceRecorder.endPhase("frame.streaming", streamingStartedAt);
      const publishStartedAt = performanceRecorder.beginPhase();
      props.onPlayerUpdate?.(
        moveResult.position.x,
        moveResult.position.z,
        tileX,
        tileZ,
        playerCtrl.yawToFacing(playerYaw),
        false,
        playerYaw
      );
      performanceRecorder.endPhase("frame.publish-player", publishStartedAt);
      return;
    }

    // ── Flip animation ──
    const flipStartedAt = performanceRecorder.beginPhase();
    const result = cameraFlip.updateFlipAnimation(
      camera,
      delta,
      flipState,
      playerYaw,
      playerPitch
    );
    flipState = result;
    animating = result.animating;

    if (result.justEnteredFps) {
      lastCameraMode = CameraMode.FIRST_PERSON;
      cameraPreferences.setModeForDestination(
        "museum",
        CameraMode.FIRST_PERSON
      );
      fpsInitialYaw = result.fpsInitialYaw!;
      fpsInitialPitch = result.fpsInitialPitch!;
      fpsActive = true;
    }
    performanceRecorder.endPhase("frame.camera-flip", flipStartedAt);
  });

  // When Q is pressed again while in FPS mode, exit back to top-down.
  // Release pointer lock synchronously before the next frame snaps the camera.
  $effect(() => {
    const flip = props.flipRequested;
    if (fpsActive && flip !== flipState.lastFlipCount) {
      flipState.lastFlipCount = flip;

      if (document.pointerLockElement) {
        document.exitPointerLock();
      }

      if (camera) cameraFlip.syncFpsFromCamera(camera);
      syncPositionFromPhysics();
      // Clear held keys to prevent stale movement (mutate parent's Set)
      (props.heldKeys ?? new Set()).clear();
      fpsActive = false;
      animating = true;
      flipState.animating = true;
      flipState.goingDown = false;
    }
  });

  // Instant mode switch (first-person ↔ third-person) triggered by parent's Q cycle
  let lastModeChangeCount = 0;
  $effect(() => {
    const modeChange = props.modeChangeRequested ?? 0;
    if (modeChange !== lastModeChangeCount) {
      lastModeChangeCount = modeChange;
      if (fpsActive) {
        // Toggle via camera preferences - UCC reacts automatically via its
        // $effect.pre that syncs mode from cameraPreferences
        const next =
          lastCameraMode === CameraMode.THIRD_PERSON
            ? CameraMode.FIRST_PERSON
            : CameraMode.THIRD_PERSON;
        const third = next === CameraMode.THIRD_PERSON;
        lastCameraMode = next;
        cameraPreferences.setModeForDestination("museum", next);
        try {
          sessionStorage.setItem(
            CAMERA_MODE_HMR_KEY,
            third ? "THIRD_PERSON" : "FIRST_PERSON"
          );
        } catch {
          /* non-critical */
        }
        props.onViewModeChange?.(third ? "third-person" : "first-person");
      }
    }
  });

  // Reset to spawn when requested (R key or Home)
  let lastResetCount = 0;
  $effect(() => {
    const reset = props.resetRequested ?? 0;
    if (reset !== lastResetCount) {
      lastResetCount = reset;
      playerCtrl.resetToSpawn();
      playerYaw = spawnYaw;
      targetPlayerYaw = spawnYaw;
      if (fpsActive) {
        fpsInitialYaw = spawnYaw;
        fpsInitialPitch = 0;
        fpsActive = false;
        requestAnimationFrame(() => {
          fpsActive = true;
          flipState.progress = 1;
        });
      }
      syncPositionFromPhysics();
    }
  });

  // ── MCP Game Bridge (lets Claude walk around the museum) ──
  let gameBridgeInitialized = false;

  $effect(() => {
    if (typeof window === "undefined" || !import.meta.env.DEV) return;
    if (gameBridgeInitialized) return;

    import("$lib/shared/3d/debug/game-bridge").then(
      async ({
        initGameBridge,
        isGameBridgeEnabled,
        shouldConnectGameBridge,
      }) => {
        // Opt-in only — see isGameBridgeEnabled. Skip silently otherwise.
        if (!isGameBridgeEnabled()) return;
        gameBridgeInitialized = true;

        const bridge = initGameBridge(
          {
            physics: {
              getPlayerPosition: () =>
                physicsProvider?.getPlayerPosition() ?? null,
              getPlayerVelocity: () =>
                physicsProvider?.getVelocity() ?? { x: 0, y: 0, z: 0 },
              isGrounded: () => physicsProvider?.isGrounded() ?? false,
              // The bridge drives the physics body directly. The reactive
              // playerPosition normally follows the body inside the UCC's
              // movement step, which a bridge move or teleport never enters,
              // so the avatar, proximity culling and the caves' position-driven
              // state would stay at the previous spot until the next keypress.
              // Sync the way the portal and Moon arrivals already do.
              movePlayer: (movement, deltaTime) => {
                physicsProvider?.movePlayer(movement, deltaTime);
                syncPositionFromPhysics();
              },
              teleportPlayer: (position) => {
                physicsProvider?.teleport?.(position);
                syncPositionFromPhysics();
              },
              raycast: (origin, direction, maxDistance) =>
                bridgeRaycast(origin, direction, maxDistance),
            },
            camera: {
              getMode: () =>
                fpsActive
                  ? lastCameraMode === CameraMode.THIRD_PERSON
                    ? "third_person"
                    : "first_person"
                  : "orbit",
              setMode: (mode: string) => {
                if (mode === "first_person") {
                  lastCameraMode = CameraMode.FIRST_PERSON;
                  if (!fpsActive) {
                    fpsActive = true;
                  }
                } else if (mode === "third_person") {
                  lastCameraMode = CameraMode.THIRD_PERSON;
                  if (!fpsActive) {
                    fpsActive = true;
                  }
                } else if (mode === "orbit" && fpsActive) {
                  fpsActive = false;
                }
              },
              getYaw: () => playerYaw,
              getPitch: () => playerPitch,
              setYaw: (yaw: number) => {
                playerYaw = yaw;
                externalYaw = yaw;
              },
              // Pitch is owned by UCC in FPS mode; push through the external
              // override so look-up/down works from the bridge.
              setPitch: (pitch: number) => {
                playerPitch = pitch;
                externalPitch = pitch;
              },
            },
            playback: {
              getPerformerManager: () => null,
              getSpeed: () => 1,
              setSpeed: () => {},
            },
          },
          { debug: true }
        );

        // Only open the WebSocket when the MCP controller is actually running —
        // otherwise an absent server spams reconnects. Direct driving via
        // window.__gameBridge needs no socket.
        if (shouldConnectGameBridge()) {
          try {
            await bridge.connect();
          } catch {
            // MCP Game Bridge not available
          }
        }
      }
    );

    return () => {
      import("$lib/shared/3d/debug/game-bridge").then(
        ({ destroyGameBridge }) => {
          destroyGameBridge();
        }
      );
    };
  });

  // ── Per-room geometry streaming (delegated to MuseumGeometryStreamer) ──
  let geometryReady = $state(false);
  let shaderWarmupStarted = false;

  $effect(() => {
    if (!props.assetsReady || !geometryReady || shaderWarmupStarted) return;
    const renderer = resolveRenderer(threlteCtx);
    const scene = resolveScene(threlteCtx);
    if (!renderer || !scene || !camera) return;
    const warmupCamera = camera;

    shaderWarmupStarted = true;
    props.onBuildStage?.("Warming 3D view");
    void (async () => {
      const savedFpsActive = fpsActive;
      const savedPosition = warmupCamera.position.clone();
      const savedQuaternion = warmupCamera.quaternion.clone();
      const savedFov = warmupCamera.fov;
      const savedNear = warmupCamera.near;
      const savedFar = warmupCamera.far;
      const savedAvatarVisibility = playerAvatarWarmupGroup?.visible;
      try {
        // Avatar3D normally resolves from the browser cache before geometry.
        // A failed or unusually slow avatar request must not hold the whole
        // museum loading gate forever.
        await Promise.race([
          playerAvatarReady,
          new Promise<void>((resolve) => window.setTimeout(resolve, 3_000)),
        ]);

        // Enter the real FPS scene state while the loading overlay is opaque.
        // This changes ceilings, player lighting, and streamed visibility to
        // the exact signature used after Q instead of compiling a synthetic
        // object graph that Three may never finish linking.
        fpsActive = true;
        await tick();

        props.onBuildStage?.("Drawing 3D preview");
        cameraFlip.syncFpsFromPlayer(
          physicsProvider.getPlayerPosition(),
          playerYaw,
          playerPitch,
          warmupCamera
        );
        cameraFlip.initializeCamera(warmupCamera, true);
        if (playerAvatarWarmupGroup) playerAvatarWarmupGroup.visible = false;
        scene.updateMatrixWorld(true);
        warmupCamera.updateMatrixWorld(true);
        const firstWarmupStartedAt = performanceRecorder.beginPhase();
        renderer.render(scene, warmupCamera);
        performanceRecorder.endPhase(
          "render.warmup-first-person",
          firstWarmupStartedAt
        );

        // The second Q press reveals the third-person avatar without changing
        // the FPS light signature. Draw it once from a guaranteed-visible
        // camera position so that switch cannot become its first shader link.
        if (playerAvatarWarmupGroup?.children.length) {
          const playerPosition = physicsProvider.getPlayerPosition();
          playerAvatarWarmupGroup.visible = true;
          warmupCamera.position.set(
            playerPosition.x - Math.sin(playerYaw) * 3,
            playerPosition.y + 1.6,
            playerPosition.z - Math.cos(playerYaw) * 3
          );
          warmupCamera.lookAt(
            playerPosition.x,
            playerPosition.y + 0.9,
            playerPosition.z
          );
          warmupCamera.updateMatrixWorld(true);
          const thirdPersonWarmupStartedAt = performanceRecorder.beginPhase();
          renderer.render(scene, warmupCamera);
          performanceRecorder.endPhase(
            "render.warmup-third-person",
            thirdPersonWarmupStartedAt
          );
        }
      } catch (error) {
        console.warn("[Museum3DScene] FPS resource warmup failed:", error);
      } finally {
        fpsActive = savedFpsActive;
        await tick();
        if (playerAvatarWarmupGroup && savedAvatarVisibility !== undefined) {
          playerAvatarWarmupGroup.visible = savedAvatarVisibility;
        }
        warmupCamera.position.copy(savedPosition);
        warmupCamera.quaternion.copy(savedQuaternion);
        warmupCamera.fov = savedFov;
        warmupCamera.near = savedNear;
        warmupCamera.far = savedFar;
        warmupCamera.updateProjectionMatrix();
        warmupCamera.updateMatrixWorld(true);
        props.onShaderWarmupReady?.();
      }
    })();
  });

  const geometryStreamer = new MuseumGeometryStreamer(
    grid,
    props.edges ?? MUSEUM_EDGES,
    TILE_SIZE
  );

  // Track which room the player is in (updated by streamer each frame). Seed
  // it before any derived state reads it so distant graybox lights never join
  // the entrance shader signature during the initialization frame.
  let currentPlayerRoomId = $state<string | null>(
    geometryStreamer.getSpawnRoomId()
  );
  // A corridor is circulation between two rooms, not a signal to turn every
  // authored room on. It keeps the last occupied room's lighting until the next
  // room is crossed, then the fixed rig blends to that room's values.
  let currentLightingRoomId = $state<string | null>(
    geometryStreamer.getSpawnRoomId()
  );
  const playerGravity = $derived(
    moonLayout &&
      currentPlayerRoomId === MOON_ROOM_ID &&
      moonLayout.isLowGravityAt(playerPosition.x, playerPosition.z)
      ? MUSEUM_GRAVITY * MOON_GRAVITY_SCALE
      : MUSEUM_GRAVITY
  );

  // Proximity renderer
  const proximityRenderer = new MuseumProximityRenderer(grid);

  // Clean up geometry worker on component destroy
  $effect(() => {
    return () => {
      geometryStreamer.dispose();
    };
  });

  // Keep the entrance's generated StandardMaterial program small enough that
  // Chrome's driver can link it predictably. The fixtures remain visible and
  // emissive; the global key/fill plus a tiny local-light budget provide the
  // illumination without compiling six spotlight branches into every mesh.
  const MAX_TORCH_LIGHTS = 1;
  const MAX_EXHIBIT_LIGHTS = 0;
  const MAX_CEILING_LIGHTS = 0;
  const MAX_SUNLIGHTS = 0;

  // Visible sets - only these items get rendered
  let visibleTorches = $state<TorchPosition[]>([]);
  let visiblePlaques = $state<PlaquePlacement[]>([]);
  let visiblePerformers = $state<typeof grid.performers>([]);
  let visibleExhibitLights = $state<LightPosition[]>([]);
  let visibleCeilingLights = $state<LightPosition[]>([]);
  let visibleSunlights = $state<LightPosition[]>([]);
  let visibleFurniture = $state<NonNullable<typeof grid.furniture>>([]);

  function nearestLights(
    source: LightPosition[],
    limit: number
  ): LightPosition[] {
    const px = playerPosition.x;
    const pz = playerPosition.z;
    return [...source]
      .sort((a, b) => {
        const aDx = a.x - px;
        const aDz = a.z - pz;
        const bDx = b.x - px;
        const bDz = b.z - pz;
        return aDx * aDx + aDz * aDz - (bDx * bDx + bDz * bDz);
      })
      .slice(0, limit);
  }

  const renderedExhibitLights = $derived(
    nearestLights(visibleExhibitLights, MAX_EXHIBIT_LIGHTS)
  );
  const renderedCeilingLights = $derived(
    nearestLights(visibleCeilingLights, MAX_CEILING_LIGHTS)
  );
  const renderedSunlights = $derived(
    nearestLights(visibleSunlights, MAX_SUNLIGHTS)
  );

  // ── Imperative mesh management ──
  const allSceneMeshes: BatchedMesh[] = []; // for cleanup on destroy
  const ceilingChunkRefs: BatchedMeshData[] = []; // toggle per-instance visibility with fpsActive

  /** Add a room chunk's meshes to the Three.js scene */
  function addChunkToScene(chunk: RoomChunk): void {
    const sceneObj = resolveScene(threlteCtx);
    if (!sceneObj) return;
    for (const { mesh } of chunk.floorMeshes) {
      mesh.receiveShadow = true;
      sceneObj.add(mesh);
      allSceneMeshes.push(mesh);
    }
    for (const { mesh } of chunk.wallMeshes) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      sceneObj.add(mesh);
      allSceneMeshes.push(mesh);
    }
    if (chunk.kitWalls) {
      // Merged kit-run wall group (institutional wing). Child meshes carry
      // their own cameraCollider/shadow flags from the provider.
      sceneObj.add(chunk.kitWalls);
    }
    if (chunk.ceilingMesh) {
      const cm = chunk.ceilingMesh;
      for (const id of cm.instanceIds ?? []) {
        cm.mesh.setVisibleAt(id, false);
      }
      sceneObj.add(cm.mesh);
      allSceneMeshes.push(cm.mesh);
      ceilingChunkRefs.push(cm);
    }
    if (chunk.pedestalMesh) {
      chunk.pedestalMesh.castShadow = true;
      chunk.pedestalMesh.receiveShadow = true;
      sceneObj.add(chunk.pedestalMesh);
      allSceneMeshes.push(chunk.pedestalMesh);
    }
    if (chunk.signMesh) {
      chunk.signMesh.castShadow = true;
      chunk.signMesh.receiveShadow = true;
      sceneObj.add(chunk.signMesh);
      allSceneMeshes.push(chunk.signMesh);
    }
  }

  props.onBuildStage?.("Tile bucketing");

  // ── Initial load orchestration (delegated to streamer) ──
  const streamerCallbacks = {
    addChunkToScene,
    onBuildStage: props.onBuildStage,
    onGeometryReady: undefined as (() => void) | undefined,
    getCamera: () => camera,
    getScene: () => resolveScene(threlteCtx) ?? undefined,
    getRenderer: () => resolveRenderer(threlteCtx) ?? undefined,
  };

  (async () => {
    try {
      await geometryStreamer.runInitialLoad(streamerCallbacks);
    } catch (err) {
      // A worker crash/timeout rejected the lobby build. Don't hang the loading
      // overlay on black forever - log it and fall through to reveal whatever
      // geometry did load (corridors + any rooms that built).
      console.error("[Museum3DScene] Initial geometry load failed:", err);
    }

    // Mount fixtures for currently loaded rooms
    props.onBuildStage?.("Mounting fixtures");
    const lobbyChunks = [
      geometryStreamer.corridorChunk,
      ...geometryStreamer.activeRoomChunks.values(),
    ].filter(Boolean) as RoomChunk[];
    const initTorches: TorchPosition[] = [];
    const initExhibitLights: LightPosition[] = [];
    const initCeilingLights: LightPosition[] = [];
    const initSunlights: LightPosition[] = [];
    for (const chunk of lobbyChunks) {
      initTorches.push(...chunk.torchPositions);
      initExhibitLights.push(...chunk.exhibitLightPositions);
      initCeilingLights.push(...chunk.ceilingLightPositions);
      initSunlights.push(...chunk.sunlightPositions);
    }
    visibleExhibitLights = initExhibitLights;
    visibleCeilingLights = initCeilingLights;
    visibleSunlights = initSunlights;
    visibleTorches = initTorches;
    visiblePlaques = proximityRenderer.getAllPlaquePlacements(
      geometryStreamer.corridorChunk,
      geometryStreamer.activeRoomChunks
    );
    visiblePerformers = [];
    visibleFurniture = grid.furniture ?? [];
    await new Promise<void>((r) => setTimeout(r, 0));

    // Compile only the streamed entrance neighborhood after its fixed light
    // layout has mounted. Compiling the entire scene also traverses every
    // distant authored chamber; skipping this step entirely makes the first
    // FPS frame discover the lobby's wall programs synchronously.
    props.onBuildStage?.("Warming 3D view");
    const renderer = resolveRenderer(threlteCtx);
    const scene = resolveScene(threlteCtx);
    const warmupCamera = camera;
    if (renderer && scene && warmupCamera) {
      const compileTargets: Object3D[] = [];
      for (const chunk of lobbyChunks) {
        compileTargets.push(
          ...chunk.floorMeshes.map(({ mesh }) => mesh),
          ...chunk.wallMeshes.map(({ mesh }) => mesh)
        );
        if (chunk.kitWalls) compileTargets.push(chunk.kitWalls);
        if (chunk.ceilingMesh) compileTargets.push(chunk.ceilingMesh.mesh);
        if (chunk.pedestalMesh) compileTargets.push(chunk.pedestalMesh);
        if (chunk.signMesh) compileTargets.push(chunk.signMesh);
      }
      // three's compileAsync polls program readiness on its own setTimeout and
      // never rejects. When one of these materials is disposed while that poll
      // is pending (the streamer drops the lobby chunks the moment a restored
      // visitor position lands in another wing), the tick throws inside the
      // timer, the catch below never sees it, and this await parks for good:
      // geometryReady never flips and the museum boots to a black screen.
      // Cap the wait the way scene-boot/renderer-warmup.ts does.
      try {
        const compiled = Promise.all(
          compileTargets.map((object) =>
            renderer.compileAsync(object, warmupCamera, scene)
          )
        ).then(() => "settled" as const);
        const capped = new Promise<"capped">((resolve) =>
          setTimeout(() => resolve("capped"), ENTRANCE_WARMUP_CAP_MS)
        );
        if ((await Promise.race([compiled, capped])) === "capped") {
          console.warn(
            `[Museum3DScene] entrance shader warmup capped after ${ENTRANCE_WARMUP_CAP_MS}ms; revealing anyway.`
          );
        }
      } catch (error) {
        // Rendering remains usable without precompilation. Preserve the normal
        // ready path and retain the driver error for diagnosis.
        console.warn("[Museum3DScene] entrance shader warmup failed:", error);
      }
    }

    // Signal ready
    geometryReady = true;
    props.onGeometryReady?.();
  })();

  // ── Room streaming: activate/deactivate rooms as the player moves ──

  // Collaboration room center - for positioning the live Village sim
  const collabWing = $derived(grid.wings.find((w) => w.id === "collaboration"));
  const collabCenterX = $derived(
    collabWing
      ? (collabWing.bounds.x + collabWing.bounds.width / 2) * TILE_SIZE
      : 0
  );
  const collabCenterZ = $derived(
    collabWing
      ? (collabWing.bounds.y + collabWing.bounds.height / 2) * TILE_SIZE
      : 0
  );
  function syncPlayerRoomFromStreamer(): void {
    const detectedRoomId = geometryStreamer.currentPlayerRoomId;
    currentPlayerRoomId = detectedRoomId;
    if (detectedRoomId) currentLightingRoomId = detectedRoomId;
  }

  const authoredPointLightPlans = new Map<string, AuthoredPointLightPlan>();
  function handleAuthoredPointLightPlanChange(
    sourceId: string,
    plan: AuthoredPointLightPlan | null
  ): void {
    if (plan) authoredPointLightPlans.set(sourceId, plan);
    else authoredPointLightPlans.delete(sourceId);
  }
  const performerRoomById = new Map(
    grid.performers.map((performer) => {
      const room = grid.wings.find((wing) => {
        const bounds = wing.bounds;
        return (
          performer.tileX >= bounds.x &&
          performer.tileX < bounds.x + bounds.width &&
          performer.tileY >= bounds.y &&
          performer.tileY < bounds.y + bounds.height
        );
      });
      return [performer.id, room?.id ?? null] as const;
    })
  );
  const activePerformerIds = $derived.by(() => {
    if (!fpsActive || !currentPlayerRoomId) return new Set<string>();
    return new Set(
      grid.performers
        .filter(
          (performer) =>
            performerRoomById.get(performer.id) === currentPlayerRoomId
        )
        .map((performer) => performer.id)
    );
  });
  $effect(() => {
    const roomId = currentPlayerRoomId;
    visiblePerformers = roomId
      ? grid.performers.filter(
          (performer) => performerRoomById.get(performer.id) === roomId
        )
      : [];
  });
  const villageEmbedMounted = $derived(geometryReady && !!collabWing);

  // K's posted notes: only the current room's, like the performers.
  const placedNotes = placeFreeNotes(grid, TILE_SIZE);
  const visibleNotes = $derived(
    currentPlayerRoomId
      ? placedNotes.filter((n) => n.roomId === currentPlayerRoomId)
      : []
  );
  // The case triptych behind each cave performer: screen + card sign.
  const caseScreens = $derived(
    visiblePerformers.flatMap((performer) => {
      const card = caveCaseCard(performer.id);
      return card ? [{ performer, card }] : [];
    })
  );

  /** Set mesh.visible on every mesh in a room chunk */
  function setChunkVisible(chunk: RoomChunk, visible: boolean): void {
    for (const { mesh } of chunk.floorMeshes) mesh.visible = visible;
    for (const { mesh } of chunk.wallMeshes) mesh.visible = visible;
    if (chunk.kitWalls) chunk.kitWalls.visible = visible;
    if (chunk.ceilingMesh)
      chunk.ceilingMesh.mesh.visible = visible && fpsActive;
    if (chunk.pedestalMesh) chunk.pedestalMesh.visible = visible;
    if (chunk.signMesh) chunk.signMesh.visible = visible;
  }

  /** Show all active room chunks - used in top-down mode and during flip animation */
  function showAllRooms(): void {
    for (const chunk of geometryStreamer.activeRoomChunks.values()) {
      setChunkVisible(chunk, true);
    }
    geometryStreamer.lastPlayerRoomId = null;
  }

  // Toggle ceiling visibility when switching between FPS and top-down.
  $effect(() => {
    if (fpsActive) {
      for (const chunk of geometryStreamer.activeRoomChunks.values()) {
        if (chunk.ceilingMesh) chunk.ceilingMesh.mesh.visible = true;
      }
      if (geometryStreamer.corridorChunk?.ceilingMesh) {
        geometryStreamer.corridorChunk.ceilingMesh.mesh.visible = true;
      }
    } else {
      for (const cm of ceilingChunkRefs) {
        cm.mesh.visible = false;
      }
      showAllRooms();
    }
  });

  // Shadow disabled on dynamic lights - toggling castShadow reactively causes
  // Three.js deallocateRenderTarget crashes.

  // Discriminated by category so the drain loop narrows `item` to the correct
  // fixture type per case with no casts. Mirrors the visible* $state element types.
  type PendingMount =
    | { category: "plaque"; item: PlaquePlacement }
    | { category: "performer"; item: (typeof grid.performers)[number] }
    | {
        category: "exhibitLight" | "ceilingLight" | "sunlight";
        item: LightPosition;
      }
    | {
        category: "furniture";
        item: NonNullable<typeof grid.furniture>[number];
      }
    | { category: "torch"; item: TorchPosition };
  let pendingMounts: PendingMount[] = [];

  // The closest fixture receives one permanent light slot. Changing fixtures
  // only updates uniforms; the PointLight object itself never mounts/unmounts.
  const torchLightSlot = $derived.by(() => {
    const px = playerPosition.x;
    const pz = playerPosition.z;
    const nearest = [...visibleTorches]
      .sort((a, b) => {
        const aDx = a.x - px;
        const aDz = a.z - pz;
        const bDx = b.x - px;
        const bDz = b.z - pz;
        return aDx * aDx + aDz * aDz - (bDx * bDx + bDz * bDz);
      })
      .slice(0, MAX_TORCH_LIGHTS)[0];
    if (!nearest) {
      return { x: 0, y: 1.45, z: 0, color: "#ffffff", intensity: 0 };
    }
    const config = FIXTURE_REGISTRY[nearest.wingTheme];
    return {
      x: nearest.x + nearest.wallOffsetX,
      y: 1.45 + config.yOffset,
      z: nearest.z + nearest.wallOffsetZ,
      color: config.lightColor,
      intensity: config.lightIntensity,
    };
  });

  function collectRoomLights(): RoomLight[] {
    const lights: RoomLight[] = [];
    for (const chunk of geometryStreamer.activeRoomChunks.values()) {
      if (chunk.roomLight) lights.push(chunk.roomLight);
    }
    return lights;
  }

  let roomLightPool = $state<RoomLightSlot[]>(createEmptyPool());
  let roomLightTarget = createEmptyPool();
  let authoredPointLightPool = $state<AuthoredPointLightSlot[]>(
    createEmptyAuthoredPointLightPool()
  );
  let authoredPointLightTarget = createEmptyAuthoredPointLightPool();
  let lightElapsedSeconds = 0;
  let lastLightSampleX = Number.POSITIVE_INFINITY;
  let lastLightSampleZ = Number.POSITIVE_INFINITY;
  let lastLightingRoomId: string | null = null;
  let lastActiveRoomCount = -1;

  useTask((delta) => {
    if (props.visible === false) return;

    const lightingStartedAt = performanceRecorder.beginPhase();

    lightElapsedSeconds += delta;
    const px = playerPosition.x;
    const pz = playerPosition.z;
    const dx = px - lastLightSampleX;
    const dz = pz - lastLightSampleZ;
    const movedEnough = dx * dx + dz * dz >= 0.25;
    const roomChanged = currentLightingRoomId !== lastLightingRoomId;
    const activeRoomCount = geometryStreamer.activeRoomChunks.size;

    if (movedEnough || roomChanged || activeRoomCount !== lastActiveRoomCount) {
      roomLightTarget = recomputeNearbyLightsFromPool(
        px,
        pz,
        collectRoomLights()
      );
      lastLightSampleX = px;
      lastLightSampleZ = pz;
      lastLightingRoomId = currentLightingRoomId;
      lastActiveRoomCount = activeRoomCount;
    }

    // Modulated fixtures update their target intensity every frame, but the
    // three actual PointLight objects below never mount or unmount.
    authoredPointLightTarget = selectAuthoredPointLights(
      currentLightingRoomId,
      px,
      pz,
      authoredPointLightPlans.values(),
      lightElapsedSeconds
    );

    const blendAmount = 1 - Math.exp(-8 * Math.min(delta, 0.1));
    roomLightPool = blendRoomLightPool(
      roomLightPool,
      roomLightTarget,
      blendAmount
    );
    authoredPointLightPool = blendAuthoredPointLightPool(
      authoredPointLightPool,
      authoredPointLightTarget,
      blendAmount
    );
    performanceRecorder.endPhase("frame.lighting", lightingStartedAt);
  });
</script>

<SceneEffectsCoordinator3D manager={sceneEffectsManager} />

<!-- Camera (owned by flip animation when not in FPS, by UCC when in FPS, by OrbitControls in editor) -->
<T.PerspectiveCamera
  makeDefault
  bind:ref={camera}
  fov={cameraFlip.topDown.fov}
  near={0.1}
  far={maxExtent * 3}
>
  {#if museum3dEditorState.editorActive}
    <OrbitControls
      enableDamping
      enablePan
      panSpeed={1.5}
      rotateSpeed={0.8}
      zoomSpeed={1.2}
      minDistance={1}
      maxDistance={50}
      onchange={(controls) => {
        // Persist editor camera + orbit target across HMR
        if (!camera) return;
        controls.getTarget(_editorTargetVec);
        museum3dEditorState.saveCamera({
          x: camera.position.x,
          y: camera.position.y,
          z: camera.position.z,
          targetX: _editorTargetVec.x,
          targetY: _editorTargetVec.y,
          targetZ: _editorTargetVec.z,
        });
      }}
      oncreate={(controls) => {
        // Store controls ref so editor state can retarget on object selection
        museum3dEditorState.setOrbitControls(controls);

        const saved = museum3dEditorState.loadCamera();
        if (saved) {
          // Restore position + target in one atomic setLookAt - any
          // attempt to set camera.position directly gets smoothed
          // over on the next update tick.
          controls.setLookAt(
            saved.x,
            saved.y,
            saved.z,
            saved.targetX,
            saved.targetY,
            saved.targetZ,
            false
          );
        } else {
          // First time: orbit target is 5m ahead of the player's gaze.
          const lookAheadDist = 5;
          controls.setTarget(
            playerPosition.x + Math.sin(playerYaw) * lookAheadDist,
            1.2,
            playerPosition.z + Math.cos(playerYaw) * lookAheadDist,
            false
          );
        }

        return () => {
          museum3dEditorState.setOrbitControls(null);
        };
      }}
    />
  {/if}
</T.PerspectiveCamera>

<!-- Player representation. Keep its light permanently in the scene and change
     intensity instead of visibility: Three bakes the visible-light count into
     every lit material program, so removing this light during a view switch
     would invalidate shaders across the museum. -->
<T.Group
  position.x={playerPosition.x}
  position.y={0.15}
  position.z={playerPosition.z}
>
  <T.Group visible={!fpsActive && !museum3dEditorState.editorActive}>
    <T.Mesh rotation.x={-Math.PI / 2}>
      <T.RingGeometry args={[0.18, 0.28, 16]} />
      <T.MeshBasicMaterial color="#c8b890" opacity={0.4} transparent={true} />
    </T.Mesh>
    <T.Mesh rotation.x={-Math.PI / 2}>
      <T.CircleGeometry args={[0.12, 16]} />
      <T.MeshBasicMaterial color="#c8b890" opacity={0.8} transparent={true} />
    </T.Mesh>
    <T.Group rotation.y={playerYaw}>
      <T.Mesh position.z={0.35} rotation.x={Math.PI / 2}>
        <T.ConeGeometry args={[0.06, 0.12, 3]} />
        <T.MeshBasicMaterial color="#c8b890" opacity={0.6} transparent={true} />
      </T.Mesh>
    </T.Group>
  </T.Group>
  <T.PointLight
    intensity={!fpsActive && !museum3dEditorState.editorActive ? 2 : 0}
    color="#c8b890"
    distance={4}
    position.y={1}
  />
</T.Group>

<!-- Player avatar: always mounted, visible only in third-person FPS mode.
     Stays initialized so the first Q press doesn't pay skeleton/animation setup cost. -->
<T.Group
  bind:ref={playerAvatarWarmupGroup}
  visible={fpsActive &&
    lastCameraMode === CameraMode.THIRD_PERSON &&
    !museum3dEditorState.editorActive}
>
  <Avatar3D
    id="museum-player"
    leftPropState={null}
    rightPropState={null}
    position={{
      x: playerPosition.x,
      y: playerPosition.y - 0.85 + 0.001,
      z: playerPosition.z,
    }}
    facingAngle={playerYaw}
    isActive={false}
    isMoving={fpsActive && lastCameraMode === CameraMode.THIRD_PERSON
      ? isMoving
      : false}
    moveSpeed={playerSpeed}
    moveDirection={moveDir}
    enableLocomotion={true}
    enableRootMotion={false}
    isGrounded={playerGrounded}
    verticalVelocity={playerVerticalVelocity}
    {isCrouching}
    isJumpRequested={playerJumpRequested}
    visible={true}
    onModelSwapped={handlePlayerAvatarReady}
  />
</T.Group>

<!-- UnifiedCameraController: always mounted, enabled only in FPS mode.
     Pre-mounting eliminates first-flip initialization freeze (event listeners,
     pointer lock setup, camera state sync). -->
<UnifiedCameraController
  destinationId="museum"
  {avatarState}
  {physicsProvider}
  {cameraPreferences}
  enabled={fpsActive && !museum3dEditorState.editorActive}
  moveAxis={props.moveAxis}
  moveSpeed={3}
  gravity={playerGravity}
  initialYaw={fpsInitialYaw}
  initialPitch={fpsInitialPitch}
  {externalYaw}
  {externalPitch}
  allowedModes={[CameraMode.FIRST_PERSON, CameraMode.THIRD_PERSON]}
  disableModeToggle={true}
  onModeChange={(mode: CameraMode) => {
    // Remember the user's preferred 3D mode so flipping back from 2D restores it.
    if (mode === CameraMode.FIRST_PERSON || mode === CameraMode.THIRD_PERSON) {
      lastCameraMode = mode;
      try {
        sessionStorage.setItem(
          CAMERA_MODE_HMR_KEY,
          mode === CameraMode.THIRD_PERSON ? "THIRD_PERSON" : "FIRST_PERSON"
        );
      } catch {
        /* non-critical */
      }
      // Report to parent so DimensionFlipProof's viewMode stays in sync
      props.onViewModeChange?.(
        mode === CameraMode.THIRD_PERSON ? "third-person" : "first-person"
      );
    }
  }}
  onRotationChange={(newYaw: number, newPitch: number) => {
    playerYaw = newYaw;
    playerPitch = newPitch;
  }}
/>

<!-- One direct render path in every camera mode keeps the renderer target and
     material program set stable across view switches. -->
<MuseumPostProcessing
  {geometryReady}
  {fpsActive}
  {animating}
  spawnPosition={{ x: spawnWorldX, z: spawnWorldZ }}
  visible={props.visible}
/>

<!-- Per-room ambient fill lights - fixed pool of MAX_ROOM_LIGHTS slots.
     Slots are always mounted (no shader recompilation). Unused slots have intensity=0. -->
{#each roomLightPool as slot, i (i)}
  <T.PointLight
    position={[slot.x, WALL_HEIGHT - 0.5, slot.z]}
    color={slot.color}
    intensity={slot.intensity}
    distance={slot.distance}
    decay={2}
  />
{/each}

<!-- The nearest wall fixture also uses one permanent slot. -->
<T.PointLight
  position={[torchLightSlot.x, torchLightSlot.y, torchLightSlot.z]}
  color={torchLightSlot.color}
  intensity={torchLightSlot.intensity}
  distance={8}
  decay={2}
  castShadow={false}
/>

<!-- Authored cave fixtures share three permanent slots. Room changes update
     uniforms only, so the first hallway cannot create a new material program. -->
{#each authoredPointLightPool as slot, i (i)}
  <T.PointLight
    position={[slot.x, slot.y, slot.z]}
    color={slot.color}
    intensity={slot.intensity}
    distance={slot.distance}
    decay={2}
    castShadow={false}
  />
{/each}

<!-- Global baseline keeps circulation and dark furniture readable while the
     authored fixtures and kinetic sculpture still carry the brightest values. -->
<T.AmbientLight
  intensity={hasLobbyPresentation ? 0.24 : 0.15}
  color="#c8b890"
/>
<T.HemisphereLight
  intensity={hasLobbyPresentation ? 0.42 : 0.3}
  color="#fff8e0"
  groundColor={hasLobbyPresentation ? "#3b3024" : "#2a2015"}
/>
<!-- Low directional key keeps sealed corridors legible without flattening room lighting. -->
<T.DirectionalLight
  intensity={hasLobbyPresentation ? 0.36 : 0.3}
  position={[12, 20, 8]}
  color="#fff4e2"
  castShadow={false}
/>
{#if hasLobbyPresentation}
  <!-- A visitor-side fill reveals the brown seating and reception furniture
       without competing with the sculpture or the authored ceiling fixtures. -->
  <T.DirectionalLight
    intensity={0.2}
    position={[-10, 8, -12]}
    color="#d8bea0"
    castShadow={false}
  />
{/if}

<!-- Floor, wall, ceiling, pedestal, sign meshes are added directly to the Three.js
     scene via scene.add() during init - NOT through Svelte templates. This eliminates
     reactive overhead (no $derived arrays, no {#each} diffing, no Threlte component
     mounting/unmounting). Ceiling visibility toggled via mesh.visible in $effect. -->

<!-- Exhibit plaques: individually textured with readable content -->
{#each visiblePlaques as plaque (plaque.refId)}
  {@const plaqueOverride =
    overrideVersion >= 0
      ? museumEditorOverrides.get(`plaque-${plaque.refId}`)
      : null}
  <MuseumPlaque3D
    worldX={plaqueOverride?.x ?? plaque.worldX}
    worldZ={plaqueOverride?.z ?? plaque.worldZ}
    yaw={plaque.yaw}
    wallOffsetX={plaqueOverride ? 0 : plaque.wallOffsetX}
    wallOffsetZ={plaqueOverride ? 0 : plaque.wallOffsetZ}
    content={plaque.content}
    size={plaque.size}
    refId={plaque.refId}
    generator={(content, size, refId) =>
      generatePlaqueCanvas(
        content,
        size,
        refId,
        props.plaquePictographs?.get(refId ?? "")
      )}
  />
{/each}
{#each renderedExhibitLights as pos, i (`${pos.x},${pos.z},${i}`)}
  <T.SpotLight
    position={[pos.x, 2.5, pos.z]}
    target-position={[pos.x, 1.2, pos.z]}
    intensity={3}
    color="#fff8e0"
    distance={4}
    angle={0.4}
    penumbra={0.5}
    castShadow={false}
  />
{/each}

<!-- Ceiling fluorescent lights - cold white overhead wash for institutional rooms -->
{#each renderedCeilingLights as cLight, i (`${cLight.x},${cLight.z},${i}`)}
  <T.SpotLight
    position={[cLight.x, WALL_HEIGHT - 0.3, cLight.z]}
    target-position={[cLight.x, 0, cLight.z]}
    intensity={4.2}
    color="#f1ead8"
    distance={8}
    angle={0.72}
    penumbra={0.92}
    decay={2}
    castShadow={false}
  />
{/each}

<!-- Sunlight shafts - warm golden pools for outdoor rooms.
     Each spot has a bright downward SpotLight (the sun shaft) plus a
     soft PointLight fill to brighten the surrounding ground. -->
{#each renderedSunlights as sun, i (`${sun.x},${sun.z},${i}`)}
  <T.SpotLight
    position={[sun.x + 2, WALL_HEIGHT + 3, sun.z - 1]}
    target-position={[sun.x, 0, sun.z]}
    intensity={5}
    color="#fff4d6"
    distance={18}
    angle={0.5}
    penumbra={0.8}
    castShadow={false}
  />
  <T.PointLight
    position={[sun.x, 2.5, sun.z]}
    intensity={1.5}
    color="#ffe8b0"
    distance={8}
    decay={2}
  />
{/each}

<!-- Light fixtures - model and effects vary by wing theme/era -->
{#each visibleTorches as torch, i (`${torch.x},${torch.z},${i}`)}
  <MuseumTorch3D
    x={torch.x}
    z={torch.z}
    wallOffsetX={torch.wallOffsetX}
    wallOffsetZ={torch.wallOffsetZ}
    wingTheme={torch.wingTheme}
    baseIntensity={0}
    materials={createTorchInstance(
      FIXTURE_REGISTRY[torch.wingTheme].lightColor
    )}
    castShadow={false}
    {playerPosition}
    visible={props.visible}
  />
{/each}

<!-- Manually placed fixtures are added imperatively via addTorchToScene() -
     no Svelte {#each} needed. This bypasses component mount overhead for
     instant placement. The groups are named `manual-placement-{id}` and
     removed via removeTorchFromScene() on delete/undo. -->

<!-- Performer stations: 3D mannequins with spinning staves -->
<!-- overrideVersion dependency ensures reactivity when editor moves objects -->
<!-- Collaboration room performers are replaced by the live village sim -->
{#each visiblePerformers as performer (performer.id)}
  {#if villageEmbedMounted && performer.id.startsWith("collab-")}
    <!-- Skip: replaced by MuseumVillageEmbed -->
  {:else if hasDrownedGallery && performer.id.startsWith("cave-water-")}
    <!-- Skip: the Water wing stands its three cases on pedestals and drives
         them from its consoles (DrownedGalleryAuthored) -->
  {:else if hasFirstFire && performer.id.startsWith("cave-fire-")}
    <!-- Skip: the Fire wing stands one automaton per court and lights it by
         the procession (FirstFireAuthored) -->
  {:else if hasEarthTerrace && performer.id.startsWith("cave-earth-")}
    <!-- Skip: the Earth wing stands its three cases on the rootbed below the
         terrace and its opener in the vestibule (EarthRootTerraceAuthored) -->
  {:else if performer.id.includes("telekinetic-formation")}
    {@const posOverride =
      overrideVersion >= 0
        ? museumEditorOverrides.get(`performer-station-${performer.id}`)
        : null}
    <TelekineticFormation3D
      stationId={performer.id}
      worldX={posOverride?.x ?? performer.tileX * TILE_SIZE}
      worldZ={posOverride?.z ?? performer.tileY * TILE_SIZE}
      sequenceId={performer.sequenceId}
      autoPlay={performer.autoPlay}
      active={activePerformerIds.has(performer.id)}
      presentation={performer.presentation}
      scale={performer.scale}
      userSequenceDataMap={props.userSequenceData}
    />
  {:else}
    {@const posOverride =
      overrideVersion >= 0
        ? museumEditorOverrides.get(`performer-station-${performer.id}`)
        : null}
    <MuseumPerformerStation3D
      stationId={performer.id}
      worldX={posOverride?.x ?? performer.tileX * TILE_SIZE}
      worldZ={posOverride?.z ?? performer.tileY * TILE_SIZE}
      worldY={performer.elevation ?? 0}
      facingAngle={FACING_TO_YAW[performer.facing] ?? 0}
      sequenceId={performer.sequenceId}
      autoPlay={performer.autoPlay}
      active={activePerformerIds.has(performer.id)}
      showGrid={true}
      userSequenceDataMap={props.userSequenceData}
    />
  {/if}
{/each}

<!-- Cave case triptychs: the Order's screen and card behind each performer -->
{#each caseScreens as entry (entry.performer.id)}
  <MuseumCaseScreen3D
    performerId={entry.performer.id}
    worldX={entry.performer.tileX * TILE_SIZE}
    worldZ={entry.performer.tileY * TILE_SIZE}
    worldY={entry.performer.elevation ?? 0}
    yaw={FACING_TO_YAW[entry.performer.facing] ?? 0}
    card={entry.card}
    active={activePerformerIds.has(entry.performer.id)}
  />
{/each}

<!-- K's posted notes in rooms with nothing to stick them to -->
{#each visibleNotes as placed (placed.note.id)}
  <MuseumStickyNote3D
    id={placed.note.id}
    worldX={placed.worldX}
    worldY={placed.worldY}
    worldZ={placed.worldZ}
    yaw={placed.yaw}
    text={placed.note.text}
  />
{/each}

<!-- Live Village simulation in the Room of Collaboration.
     Mounted early so avatar GLTF parsing happens in the background.
     Always visible - sits inside room walls, only seen when looking in. -->
{#if villageEmbedMounted}
  {@const nearCollab = currentPlayerRoomId === "collaboration"}
  <MuseumVillageEmbed
    centerX={collabCenterX}
    centerZ={collabCenterZ}
    showLabels={nearCollab}
    visible={props.visible !== false && nearCollab}
  />
{/if}

<!-- Pedestal + sign meshes managed imperatively via scene.add() -->

<!-- Authored room dressing remains a removable visual layer over the shared
     tile geometry, so collision and floor-plan validation stay authoritative. -->
{#each authoredRooms as room (room.id)}
  <GltfAsset
    url={room.presentation.modelPath}
    position={room.position}
    emissiveBoost={room.presentation.emissiveBoost}
  />
  {#if room.presentation.ceilingModelPath}
    <T.Group visible={fpsActive}>
      <GltfAsset
        url={room.presentation.ceilingModelPath}
        position={room.position}
        emissiveBoost={room.presentation.emissiveBoost}
      />
    </T.Group>
  {/if}
  {#if room.presentation.atmosphere}
    <T.Group position={room.atmospherePosition}>
      <FallingParticles
        type={room.presentation.atmosphere.type}
        count={room.presentation.atmosphere.count}
        area={room.atmosphereArea}
        speed={room.presentation.atmosphere.speed}
        colors={room.presentation.atmosphere.colors}
        sizeRange={room.presentation.atmosphere.sizeRange}
        spin={false}
        enabled={props.visible !== false}
      />
    </T.Group>
  {/if}
{/each}

{#if hasVulcanCaveSlice}
  <VulcanCaveScenicLayer
    rooms={grid.wings}
    currentRoomId={currentLightingRoomId}
    onLightPlanChange={handleAuthoredPointLightPlanChange}
    visible={props.visible !== false}
  />
{/if}

{#if hasDrownedGallery}
  <DrownedGalleryAuthored
    {grid}
    currentRoomId={currentPlayerRoomId}
    {playerPosition}
    onLightPlanChange={handleAuthoredPointLightPlanChange}
    visible={props.visible !== false}
  />
{/if}

{#if hasFirstFire}
  <FirstFireAuthored
    {grid}
    currentRoomId={currentPlayerRoomId}
    {playerPosition}
    onLightPlanChange={handleAuthoredPointLightPlanChange}
    visible={props.visible !== false}
  />
{/if}

{#if hasEarthTerrace}
  <EarthRootTerraceAuthored
    {grid}
    currentRoomId={currentPlayerRoomId}
    {playerPosition}
    onLightPlanChange={handleAuthoredPointLightPlanChange}
    visible={props.visible !== false}
  />
{/if}

{#if hasAirChimney}
  <AirChimneyGraybox
    {grid}
    currentRoomId={currentPlayerRoomId}
    onLightPlanChange={handleAuthoredPointLightPlanChange}
    visible={props.visible !== false}
  />
{/if}

{#if hasSundial}
  <SundialGraybox
    {grid}
    currentRoomId={currentLightingRoomId}
    {playerPosition}
    visible={props.visible !== false}
  />
{/if}

{#if hasMoon}
  <MoonGraybox
    {grid}
    currentRoomId={currentLightingRoomId}
    visible={props.visible !== false}
  />
{/if}

<!-- GLTF furniture models (Kenney CC0 kit) -->
<MuseumFurniture
  placements={visibleFurniture}
  tileSize={TILE_SIZE}
  materialTintLift={hasLobbyPresentation ? 1 : 0}
/>

<!-- Mirrors - placed in rooms that historically feature them -->
{#each grid.wings as wing}
  {#if wing.theme === "renaissance"}
    <MuseumMirror
      width={1.8}
      height={2.8}
      position={[
        (wing.bounds.x + wing.bounds.width - 1) * TILE_SIZE,
        1.6,
        (wing.bounds.y + wing.bounds.height / 2) * TILE_SIZE,
      ]}
      rotation={[0, -Math.PI / 2, 0]}
      frameColor="#9a8040"
      textureWidth={512}
      textureHeight={768}
    />
  {/if}
  {#if wing.theme === "gallery"}
    <MuseumMirror
      width={2.5}
      height={3.5}
      position={[
        (wing.bounds.x + wing.bounds.width - 1) * TILE_SIZE,
        2.0,
        (wing.bounds.y + wing.bounds.height / 2) * TILE_SIZE,
      ]}
      rotation={[0, -Math.PI / 2, 0]}
      frameColor="#6a5a30"
      textureWidth={512}
      textureHeight={768}
    />
  {/if}
{/each}

<!-- Portal pair - blue in cave, orange in gallery -->
{#if portalConfig.caveWing && portalConfig.galleryWing}
  <MuseumPortal
    position={portalConfig.bluePos}
    rotation={portalConfig.blueRot}
    destPosition={portalConfig.orangePos}
    destRotation={portalConfig.orangeRot}
    color="#0088ff"
    label="Gallery"
    visible={props.visible !== false && portalsVisible}
  />
  <MuseumPortal
    position={portalConfig.orangePos}
    rotation={portalConfig.orangeRot}
    destPosition={portalConfig.bluePos}
    destRotation={portalConfig.blueRot}
    color="#ff8800"
    label="Cave"
    visible={props.visible !== false && portalsVisible}
  />
{/if}

<!-- 3D Scene Editor - click to select, gizmo to transform -->
{#if museum3dEditorState.editorActive}
  <MuseumSceneEditor onOverrideChanged={applyEditorOverrides} />
  {#if museum3dEditorState.placementDef}
    <PlacementGhost
      def={museum3dEditorState.placementDef}
      onPlace={(x, z, yaw, wf) => editorPlacement.place(x, z, yaw, wf)}
      onDelete={(id) => editorPlacement.delete(id)}
      onUndo={() => editorPlacement.undo()}
    />
  {/if}
{/if}
