<script lang="ts">

// propInterpolator and sequenceConverter are now module-level functions
  /**
   * WorldScene
   *
   * Threlte-based scene for Infinite Worlds that enables full avatar parity
   * with Stage and Gallery. Uses the same WebGPUCanvas pattern for WebGPU support.
   *
   * Architecture:
   * - Threlte Canvas with WebGPU (falls back to WebGL)
   * - Existing managers (ChunkManager, VegetationManager, etc.) add meshes via scene reference
   * - Game loop runs via Threlte's useTask() instead of requestAnimationFrame
   * - UnifiedCameraController handles camera/movement with physics
   * - Full Avatar3D, Staff3D, Grid3D support
   */

  import WebGPUCanvas from "#lib/shared/3d/rendering/WebGPUCanvas.svelte";
  import WorldSceneContent from "./WorldSceneContent.svelte";
  import VirtualJoystick from "#lib/shared/components/touch/VirtualJoystick.svelte";

  import type { PhysicsWorldState, PlayerControllerState } from "#lib/shared/3d/physics/types.js";
  import type { PhysicsProvider } from "#lib/shared/3d/camera/types.js";
  import { TerrainPhysicsManager } from "#lib/shared/3d/physics/terrain-collider.js";
  import { teleportPlayer } from "#lib/shared/3d/physics/player-controller.js";
  import { CameraMode } from "#lib/shared/3d/camera/types.js";
  import { cameraPreferences } from "#lib/shared/3d/camera/camera-preferences.svelte.js";

  import { type HybridChunkManager } from "../core/hybrid-chunk-manager";
  import { generateWorldSeed, encodeSeed, SeededNoise } from "../generation/seed-generator";
  import { VegetationManager } from "../rendering/instanced-vegetation";
  import { AtmosphereManager } from "../rendering/atmosphere";
  import { WaterManager } from "../rendering/water";
  import type { RealmConfig } from "../core/world-config";
  import { getDefaultRealmConfig } from "../core/world-definitions";
  import { getInputCapabilities } from "#lib/shared/input/InputCapabilities.svelte.js";
  import { onMount, onDestroy } from "svelte";
  import { browser } from "$app/env";
  import type { Mesh } from "three";

  // Performer/Sequence system
  import {
    createPerformerManager,
    type PerformerManager,
  } from "#lib/shared/3d/state/performer-manager.svelte.js";
  import {
    DEFAULT_AVATAR_ID,
    type AvatarId,
  } from "@austencloud/scene-3d";
  import DuetOrchestrator from "#lib/shared/3d/components/DuetOrchestrator.svelte";


  interface Props {
    /** Realm configuration (defines terrain, physics, features, spawn) */
    realmConfig?: RealmConfig;
    /** World seed (optional - overrides realmConfig.terrain.seed if provided) */
    seed?: number;
    /** Show debug info overlay */
    showDebug?: boolean;
    /** Auto-load Hannon's Camp terrain on mount (legacy - prefer realmConfig) */
    autoLoadRealTerrain?: boolean;
    /** Enable stage mode - flat performance area with grid planes */
    stageMode?: boolean;
    /** Real-world terrain data (destinations import their own JSON and pass it down) */
    terrainData?: import("../generation/real-terrain-zone").ImportedTerrainData | null;
  }

  let {
    realmConfig,
    seed,
    showDebug = false,
    autoLoadRealTerrain = false,
    stageMode = false,
    terrainData = null,
  }: Props = $props();

  // Use provided realm config or default
  const activeConfig = $derived(realmConfig ?? getDefaultRealmConfig());

  // Stores player position/yaw in sessionStorage so HMR doesn't reset you to spawn.
  // Key is per-realm so different worlds don't share camera state.

  interface HMRState {
    x: number;
    y: number;
    z: number;
    yaw: number;
    cameraMode: CameraMode;
  }

  function getHMRKey(): string {
    return `realm-hmr-${activeConfig.id}`;
  }

  function loadHMRState(): HMRState | null {
    if (!browser) return null;
    try {
      const stored = sessionStorage.getItem(getHMRKey());
      if (!stored) return null;
      const state = JSON.parse(stored) as HMRState;
      // Reject stored state if position is underground (invalid)
      const minSafeHeight = (activeConfig.terrain?.waterLevel ?? 5) + 2;
      if (state.y < minSafeHeight) return null;
      return state;
    } catch {
      return null;
    }
  }

  function saveHMRState(state: HMRState): void {
    if (!browser) return;
    try {
      sessionStorage.setItem(getHMRKey(), JSON.stringify(state));
    } catch {
      // Ignore storage errors
    }
  }

  // Load initial state from HMR storage (if exists for THIS realm)
  const hmrState = loadHMRState();

  // ============================================================================
  // STATE (bindable to WorldSceneContent)
  // ============================================================================

  // Physics state
  let physicsState: PhysicsWorldState | null = $state(null);
  let terrainPhysics: TerrainPhysicsManager | null = $state(null);
  let playerController: PlayerControllerState | null = $state(null);
  let physicsProvider: PhysicsProvider | null = $state(null);

  // Managers
  let vegetationManager: VegetationManager | null = $state(null);
  let atmosphereManager: AtmosphereManager | null = $state(null);
  let waterManager: WaterManager | null = $state(null);
  let chunkManager: HybridChunkManager | null = $state(null);
  let chunkMeshes = $state(new Map<string, Mesh>());

  // World generation - _initialSeed is stable so $derived won't regenerate random seeds
  const _initialSeed = generateWorldSeed();
  const worldSeed = $derived(seed ?? activeConfig.terrain.seed ?? _initialSeed);
  const worldSeedEncoded = $derived(encodeSeed(worldSeed));
  const worldNoise = $derived(new SeededNoise(worldSeed));

  // Avatar/Camera state - restore from HMR if available
  // Default to ORBIT so users see the welcome overlay and can click to enter exploration
  let cameraMode = $state<CameraMode>(hmrState?.cameraMode ?? CameraMode.ORBIT);

  // Game-bridge raycast fn, bound out of WorldSceneContent (which owns the
  // scene camera + graph). Null until the inner scene mounts.
  let sceneRaycast = $state<
    | ((
        origin?: { x: number; y: number; z: number },
        direction?: { x: number; y: number; z: number },
        maxDistance?: number,
      ) => import("#lib/shared/3d/debug/game-bridge-types.js").RaycastResult)
    | null
  >(null);
  const showAvatar = $derived(cameraMode !== CameraMode.FIRST_PERSON);
  let showGridPlanes = $state(false); // Disabled for exploration mode

  // Player position (updated from physics) - restore from HMR if available
  let playerPosition = $state({
    x: hmrState?.x ?? 0,
    y: hmrState?.y ?? 0,
    z: hmrState?.z ?? 0,
  });
  let playerYaw = $state(hmrState?.yaw ?? 0);
  let targetPlayerYaw = $state(hmrState?.yaw ?? 0);
  let isMoving = $state(false);
  let moveDir = $state({ x: 0, z: 0 });
  const ROTATION_SPEED = 12;

  // Flag to indicate we should teleport to HMR position after physics init
  let pendingHMRTeleport = hmrState !== null;

  // Debug stats
  let fps = $state(0);
  let frameCount = $state(0);
  let fpsTime = $state(0);
  let chunkStats = $state({ loaded: 0, pending: 0, loading: 0 });
  let colliderCount = $state(0);
  let vegetationCount = $state({ trees: 0, rocks: 0, bushes: 0, grass: 0 });
  let currentBiome = $state("forest");

  // Environment toggle states (tracked here for reactivity)
  let terrainTexturesEnabled = $state(true);
  let fogEnabled = $state(true);
  let waterVisible = $state(true);

  // Vegetation toggle states
  let treesEnabled = $state(true);
  let grassEnabled = $state(true);
  let rocksEnabled = $state(true);
  let bushesEnabled = $state(true);

  // Physics state
  let noclipEnabled = $state(false);
  let isGrounded = $state(true);
  const walkSpeed = 5.0;
  const sprintSpeed = 10.0;

  // Camera settings
  let fov = $state(75);
  let sensitivity = $state(1.0);

  // View distance
  let viewDistance = $state(256);
  const chunkSize = 64;

  // Debug panel visibility
  let debugPanelVisible = $state(true);

  // Terrain zone state
  let hannonsLoaded = $state(false);
  let zoneBounds = $state<{ minX: number; maxX: number; minZ: number; maxZ: number } | null>(null);
  let zoneBoundary = $state<Array<{ x: number; z: number }>>([]);
  let isInsideZone = $state(false);

  // Touch UI
  let showTouchUI = $state(false);
  let joystickInput = $state({ x: 0, z: 0 });
  const inputCapabilities = getInputCapabilities();

  // ============================================================================
  // PERFORMER/SEQUENCE SYSTEM
  // ============================================================================

  // Performer management (for sequence playback)
  let performerManager = $state<PerformerManager | null>(null);
  let sequenceBrowserOpen = $state(false);
  let playbackSpeed = $state(1);

  // Derived: shorthand accessors from performer manager
  const performerStates = $derived.by(() => {
    return performerManager ? performerManager.performers : [];
  });
  const activePerformerIndex = $derived.by(() => {
    return performerManager ? performerManager.activeIndex : 0;
  });
  const activePerformerState = $derived.by(() => {
    return performerManager ? performerManager.activeState : null;
  });

  // Initialize performer manager on mount
  $effect(() => {
    if (browser && !performerManager) {
      performerManager = createPerformerManager({
        initialCharacterId: DEFAULT_AVATAR_ID,
      });

      // Initialize with first performer
      performerManager.initialize();
    }
  });

  // Sync speed to all performer states
  $effect(() => {
    performerManager?.setSpeed(playbackSpeed);
  });

  // Cleanup performer manager
  onDestroy(() => {
    performerManager?.destroy();
  });

  // ============================================================================
  // MCP GAME BRIDGE (for Claude to inspect game state)
  // ============================================================================

  let gameBridgeInitialized = false;

  // Initialize MCP Game Bridge in dev mode
  $effect(() => {
    if (!browser || !import.meta.env.DEV) return;
    if (!physicsProvider || !performerManager) return;
    if (gameBridgeInitialized) return;

    import("#lib/shared/3d/debug/game-bridge.js").then(async ({ initGameBridge, isGameBridgeEnabled, shouldConnectGameBridge }) => {
      // Opt-in only — see isGameBridgeEnabled. Skip silently otherwise.
      if (!isGameBridgeEnabled()) return;
      gameBridgeInitialized = true;

      const bridge = initGameBridge({
        physics: {
          getPlayerPosition: () => physicsProvider?.getPlayerPosition() ?? null,
          getPlayerVelocity: () => physicsProvider?.getVelocity() ?? { x: 0, y: 0, z: 0 },
          isGrounded: () => physicsProvider?.isGrounded() ?? false,
          movePlayer: (movement, deltaTime) => physicsProvider?.movePlayer(movement, deltaTime),
          teleportPlayer: (position) => physicsProvider?.teleport?.(position),
          raycast: (origin, direction, maxDistance) =>
            sceneRaycast ? sceneRaycast(origin, direction, maxDistance) : { hit: false },
        },
        camera: {
          getMode: () => cameraMode === CameraMode.FIRST_PERSON ? "first_person" : cameraMode === CameraMode.THIRD_PERSON ? "third_person" : "orbit",
          setMode: (mode: string) => {
            if (mode === "first_person") cameraMode = CameraMode.FIRST_PERSON;
            else if (mode === "third_person") cameraMode = CameraMode.THIRD_PERSON;
            else if (mode === "orbit") cameraMode = CameraMode.ORBIT;
          },
          getYaw: () => playerYaw,
          getPitch: () => 0, // Pitch tracked separately in camera controller
          setYaw: (yaw: number) => { playerYaw = yaw; },
          setPitch: (_pitch: number) => { /* Not directly settable */ },
        },
        playback: {
          getPerformerManager: () => performerManager,
          getSpeed: () => playbackSpeed,
          setSpeed: (s: number) => { playbackSpeed = s; },
        },
      }, {
        debug: true,
      });

      // Only open the WebSocket when the MCP controller is actually running.
      // Direct driving via window.__gameBridge needs no socket; connecting to
      // an absent server is what produced the reconnect spam.
      if (shouldConnectGameBridge()) {
        try {
          await bridge.connect();
        } catch {
          // MCP Game Bridge not available — ignored silently
        }
      }
    });
  });

  // ============================================================================
  // AVATAR STATE (for UnifiedCameraController)
  // ============================================================================

  const avatarState = {
    get position() {
      return playerPosition;
    },
    get facingAngle() {
      return playerYaw;
    },
    get isMoving() {
      return isMoving;
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

  // ============================================================================
  // HMR STATE PERSISTENCE
  // ============================================================================

  // Save state periodically for HMR (throttled to avoid excessive writes)
  let lastSaveTime = 0;
  $effect(() => {
    // Track position and yaw changes
    const { x, y, z } = playerPosition;
    const yaw = playerYaw;
    const mode = cameraMode;

    // Throttle saves to every 500ms
    const now = Date.now();
    if (now - lastSaveTime > 500) {
      lastSaveTime = now;
      saveHMRState({ x, y, z, yaw, cameraMode: mode });
    }
  });

  // Keyboard handler for debug panel toggle (backtick)
  $effect(() => {
    function handleKeydown(e: KeyboardEvent) {
      // Backtick to toggle debug panel
      if (e.key === "`" || e.key === "~") {
        e.preventDefault();
        debugPanelVisible = !debugPanelVisible;
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  });

  // Teleport to HMR position once physics is ready
  $effect(() => {
    if (pendingHMRTeleport && playerController && hmrState) {
      // Small delay to ensure physics is fully initialized
      setTimeout(() => {
        if (playerController) {
          teleportPlayer(playerController, {
            x: hmrState.x,
            y: hmrState.y,
            z: hmrState.z,
          });
          playerYaw = hmrState.yaw;
          pendingHMRTeleport = false;
        }
      }, 100);
    }
  });
</script>

<div class="realm-world">
  <WebGPUCanvas
    renderingBackend="webgpu-auto"
    autoRender={true}
    toneMapping={undefined}
  >
    <WorldSceneContent
      {activeConfig}
      {worldSeed}
      {worldNoise}
      {autoLoadRealTerrain}
      {stageMode}
      {terrainData}
      bind:physicsState
      bind:terrainPhysics
      bind:playerController
      bind:physicsProvider
      bind:vegetationManager
      bind:atmosphereManager
      bind:waterManager
      bind:chunkManager
      bind:chunkMeshes
      bind:playerPosition
      bind:playerYaw
      bind:cameraMode
      bind:fps
      bind:frameCount
      bind:fpsTime
      bind:chunkStats
      bind:colliderCount
      bind:vegetationCount
      bind:currentBiome
      bind:hannonsLoaded
      bind:zoneBounds
      bind:zoneBoundary
      bind:isInsideZone
      bind:showTouchUI
      bind:joystickInput
      {avatarState}
      {showAvatar}
      {showGridPlanes}
      {inputCapabilities}
      bind:terrainTexturesEnabled
      bind:bridgeRaycast={sceneRaycast}
      onModeChange={(mode) => (cameraMode = mode)}
      performerState={activePerformerState}
    />
  </WebGPUCanvas>

  <!-- UI Overlays (outside Threlte Canvas) -->
  {#if showTouchUI}
    <VirtualJoystick
      onInput={(x, y) => joystickInput = { x, z: y }}
      enabled={true}
      left={24}
      bottom={24}
      size={120}
    />
    <div class="touch-look-hint">
      <span>Drag to look around</span>
    </div>
  {/if}

  <!-- DebugPanelTabs removed; replaced by scene-feature gear popover system -->

  {#if hannonsLoaded && zoneBounds}
    <div class="zone-overlay">
      <div class="zone-header">
        <i class="fas fa-campground" aria-hidden="true"></i>
        <span>Hannon's Camp</span>
        <span class="zone-status" class:inside={isInsideZone}>
          {isInsideZone ? "INSIDE ZONE" : "OUTSIDE ZONE"}
        </span>
      </div>
      <div class="zone-info">
        <div class="info-row">
          <span class="label">Position:</span>
          <span class="value">X: {playerPosition.x.toFixed(0)}, Z: {playerPosition.z.toFixed(0)}</span>
        </div>
      </div>
    </div>
  {/if}

  {#if showDebug}
    <div class="debug-overlay">
      <div class="debug-row">
        <span class="label">FPS:</span>
        <span class="value">{fps}</span>
      </div>
      <div class="debug-row">
        <span class="label">Position:</span>
        <span class="value">({playerPosition.x.toFixed(1)}, {playerPosition.y.toFixed(1)}, {playerPosition.z.toFixed(1)})</span>
      </div>
      <div class="debug-row">
        <span class="label">Chunks:</span>
        <span class="value">
          {chunkStats.loaded} loaded / {chunkStats.loading} loading / {chunkStats.pending} pending
        </span>
      </div>
      <div class="debug-row">
        <span class="label">Colliders:</span>
        <span class="value">{colliderCount}</span>
      </div>
      <div class="debug-row">
        <span class="label">Vegetation:</span>
        <span class="value">
          {vegetationCount.trees} trees / {vegetationCount.rocks} rocks
        </span>
      </div>
      <div class="debug-row">
        <span class="label">Seed:</span>
        <span class="value">{worldSeedEncoded}</span>
      </div>
    </div>
  {/if}

  <!-- Controls overlay when in orbit mode (not exploring) -->
  <!-- Clickable: transitions to third-person mode on click -->
  <!-- This handles the click at the parent level because the camera controller -->
  <!-- may not be mounted yet (it waits for isReadyToRender + physicsProvider) -->
  {#if cameraMode === CameraMode.ORBIT}
    <button
      class="controls-overlay"
      onclick={() => {
        cameraMode = CameraMode.THIRD_PERSON;
        cameraPreferences.setModeForDestination(activeConfig.id, CameraMode.THIRD_PERSON);
      }}
    >
      <h2>{activeConfig.name}</h2>
      {#if activeConfig.description}
        <p class="description">{activeConfig.description}</p>
      {/if}
      <p class="seed">Seed: <code>{worldSeedEncoded}</code></p>
      <div class="instructions">
        <p><strong>Click</strong> to start exploring</p>
        <p><strong>WASD</strong> to move</p>
        <p><strong>Mouse</strong> to look around</p>
        <p><strong>Shift</strong> to sprint</p>
        <p><strong>Space</strong> to jump</p>
        <p><strong>V</strong> to change camera mode</p>
      </div>
    </button>
  {/if}

  <!-- Sequence Playback Controls -->
  {#if activePerformerState}
    <div class="playback-controls">
      <button
        class="control-btn"
        onclick={() => sequenceBrowserOpen = true}
        title="Load sequence"
        aria-label="Load sequence"
      >
        <i class="fas fa-folder-open" aria-hidden="true"></i>
      </button>

      {#if activePerformerState.hasSequence}
        <div class="sequence-info">
          <span class="sequence-name">{activePerformerState.loadedSequence?.word ?? 'Sequence'}</span>
          <span class="step-counter">
            {activePerformerState.currentStepIndex + 1} / {activePerformerState.totalSteps}
          </span>
        </div>

        <button
          class="control-btn"
          onclick={() => activePerformerState?.prevStep()}
          title="Previous step"
          aria-label="Previous step"
          disabled={activePerformerState.currentStepIndex === 0}
        >
          <i class="fas fa-step-backward" aria-hidden="true"></i>
        </button>

        <button
          class="control-btn play-btn"
          onclick={() => activePerformerState?.togglePlay()}
          title={activePerformerState.isPlaying ? 'Pause' : 'Play'}
          aria-label={activePerformerState.isPlaying ? 'Pause' : 'Play'}
        >
          <i class="fas" class:fa-pause={activePerformerState.isPlaying} class:fa-play={!activePerformerState.isPlaying} aria-hidden="true"></i>
        </button>

        <button
          class="control-btn"
          onclick={() => activePerformerState?.nextStep()}
          title="Next step"
          aria-label="Next step"
          disabled={activePerformerState.currentStepIndex >= activePerformerState.totalSteps - 1}
        >
          <i class="fas fa-step-forward" aria-hidden="true"></i>
        </button>

        <button
          class="control-btn"
          onclick={() => activePerformerState?.reset()}
          title="Reset to start"
          aria-label="Reset to start"
        >
          <i class="fas fa-undo" aria-hidden="true"></i>
        </button>

        <button
          class="control-btn"
          class:active={activePerformerState.loop}
          onclick={() => {
            if (activePerformerState) activePerformerState.loop = !activePerformerState.loop;
          }}
          title={activePerformerState.loop ? 'Looping enabled' : 'Enable loop'}
          aria-label={activePerformerState.loop ? 'Looping enabled' : 'Enable loop'}
        >
          <i class="fas fa-sync" aria-hidden="true"></i>
        </button>
      {/if}
    </div>
  {/if}

  <!-- Sequence Browser (Duet Orchestrator) -->
  {#if performerManager}
    <DuetOrchestrator
      open={sequenceBrowserOpen}
      {performerManager}
      onClose={() => (sequenceBrowserOpen = false)}
    />
  {/if}
</div>

<style>
  .realm-world {
    position: absolute;
    inset: 0;
    overflow: hidden;
    background: #0a0a1a;
    /* Prevent browser touch gestures (pinch-zoom, scroll) from interfering with drag-to-look */
    touch-action: none;
  }

  .controls-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: white;
    background: rgba(0, 0, 0, 0.5);
    border: none;
    font: inherit;
    cursor: pointer;
    z-index: 10;
  }

  .controls-overlay:hover {
    background: rgba(0, 0, 0, 0.4);
  }

  .controls-overlay h2 {
    margin: 0 0 16px 0;
    font-size: 28px;
    font-weight: 600;
    color: #60a5fa;
  }

  .controls-overlay .description {
    margin: 0 0 8px 0;
    color: rgba(255, 255, 255, 0.7);
    font-size: 14px;
    font-style: italic;
  }

  .controls-overlay .seed {
    margin: 0 0 24px 0;
    color: rgba(255, 255, 255, 0.6);
    font-size: 14px;
  }

  .controls-overlay code {
    font-family: monospace;
    background: rgba(255, 255, 255, 0.1);
    padding: 4px 8px;
    border-radius: 4px;
    color: #f59e0b;
  }

  .instructions p {
    margin: 8px 0;
    font-size: 16px;
  }

  .instructions strong {
    color: #f59e0b;
    font-weight: 600;
  }

  .debug-overlay {
    position: absolute;
    top: 16px;
    left: 16px;
    background: rgba(0, 0, 0, 0.8);
    padding: 12px 16px;
    border-radius: 8px;
    font-family: monospace;
    font-size: 12px;
    color: white;
    pointer-events: none;
  }

  .debug-row {
    display: flex;
    gap: 8px;
    margin: 4px 0;
  }

  .debug-row .label {
    color: rgba(255, 255, 255, 0.6);
  }

  .debug-row .value {
    color: #60a5fa;
  }

  .zone-overlay {
    position: absolute;
    top: 16px;
    right: 16px;
    background: rgba(0, 0, 0, 0.9);
    padding: 16px;
    border-radius: 12px;
    border: 2px solid #f97316;
    color: white;
    font-family: system-ui, sans-serif;
    min-width: 220px;
  }

  .zone-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  }

  .zone-header i {
    color: #f97316;
    font-size: 18px;
  }

  .zone-header span:first-of-type {
    font-weight: 600;
    font-size: 16px;
  }

  .zone-status {
    margin-left: auto;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    background: #ef4444;
  }

  .zone-status.inside {
    background: #22c55e;
  }

  .zone-info .info-row {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    margin: 4px 0;
  }

  .zone-info .label {
    color: rgba(255, 255, 255, 0.6);
  }

  .zone-info .value {
    color: #60a5fa;
    font-family: monospace;
  }

  .touch-look-hint {
    position: fixed;
    top: 50%;
    right: 20%;
    transform: translateY(-50%);
    color: rgba(255, 255, 255, 0.6);
    font-size: 14px;
    font-weight: 500;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
    pointer-events: none;
    animation: fadeInOut 4s ease-in-out;
    z-index: 100;
  }

  @keyframes fadeInOut {
    0%, 100% { opacity: 0; }
    15%, 85% { opacity: 1; }
  }

  @media (prefers-reduced-motion: reduce) {
    .touch-look-hint {
      animation: none;
      opacity: 0.6;
    }
  }

  /* Playback Controls */
  .playback-controls {
    position: absolute;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    background: rgba(0, 0, 0, 0.85);
    border-radius: 16px;
    backdrop-filter: blur(10px);
    z-index: 100;
  }

  .control-btn {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.1);
    border: none;
    border-radius: 10px;
    color: white;
    font-size: 16px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .control-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.2);
    transform: scale(1.05);
  }

  .control-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .control-btn.play-btn {
    width: 52px;
    height: 52px;
    background: #8b5cf6;
    font-size: 18px;
  }

  .control-btn.play-btn:hover {
    background: #7c3aed;
  }

  .control-btn.active {
    background: #22c55e;
  }

  .control-btn.active:hover {
    background: #16a34a;
  }

  .sequence-info {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0 12px;
    min-width: 80px;
  }

  .sequence-name {
    font-size: 14px;
    font-weight: 600;
    color: white;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .step-counter {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
    font-family: monospace;
  }
</style>
