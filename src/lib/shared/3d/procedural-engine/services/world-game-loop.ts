import { Vector3, PerspectiveCamera, type DirectionalLight, type Camera } from "three";
import type { PhysicsWorldState, PlayerControllerState } from "#lib/shared/3d/physics/types.js";
import type { TerrainPhysicsManager } from "#lib/shared/3d/physics/terrain-collider.js";
import {
  getPlayerPosition,
  snapToGround,
  teleportPlayer,
} from "#lib/shared/3d/physics/player-controller.js";
import type { HybridChunkManager } from "../core/hybrid-chunk-manager";
import type { VegetationManager } from "../rendering/instanced-vegetation";
import type { AtmosphereManager } from "../rendering/atmosphere";
import type { WaterManager } from "../rendering/water";
import type { DrainageWaterManager } from "../rendering/drainage-water";
import type { SeededNoise} from "../generation/seed-generator";
import { getBiome } from "../generation/seed-generator";
import { isPointInPolygon } from "../generation/real-terrain-zone";
import { findInteractableSlot } from "#lib/shared/museum/services/interaction-detector.js";
import type { ExhibitSlot } from "#lib/shared/museum/domain/museum-types.js";
import type { RealmConfig } from "../core/world-config";

export interface GameLoopContext {
  physicsState: PhysicsWorldState;
  playerController: PlayerControllerState;
  terrainPhysics: TerrainPhysicsManager | null;
  chunkManager: HybridChunkManager | null;
  vegetationManager: VegetationManager | null;
  atmosphereManager: AtmosphereManager | null;
  waterManager: WaterManager | null;
  drainageWaterManager: DrainageWaterManager | null;
  sunLight: DirectionalLight | null;
  camera: { current: Camera | undefined };
  activeConfig: RealmConfig;
  worldNoise: SeededNoise;
  inputCapabilities: { shouldShowTouchUI(): boolean };
  museumState: {
    layout: { pavilions: Array<{ slots: ExhibitSlot[] }> } | null;
    isOverlayOpen: boolean;
    setInteractionTarget(id: string | null): void;
  };
  isMuseumRealm: boolean;
}

export interface GameLoopState {
  isDisposed: boolean;
  isInitialized: boolean;
  needsGroundSnap: boolean;
  groundSnapAttempts: number;
  isReadyToRender: boolean;
  frameCount: number;
  fpsTime: number;
  fps: number;
  chunkStats: { loaded: number; pending: number; loading: number };
  colliderCount: number;
  vegetationCount: { trees: number; rocks: number; bushes: number; grass: number };
  showTouchUI: boolean;
  playerPosition: { x: number; y: number; z: number };
  currentBiome: string;
  isInsideZone: boolean;
  zoneBoundary: Array<{ x: number; z: number }>;
}

const MAX_GROUND_SNAP_ATTEMPTS = 300;

export function tickWorldGameLoop(
  delta: number,
  ctx: GameLoopContext,
  state: GameLoopState
): void {
  if (state.isDisposed || !state.isInitialized) return;

  const { physicsState, playerController, terrainPhysics, camera, activeConfig, worldNoise } = ctx;

  // FPS counter
  state.frameCount++;
  state.fpsTime += delta;
  if (state.fpsTime >= 1) {
    state.fps = Math.round(state.frameCount / state.fpsTime);
    state.frameCount = 0;
    state.fpsTime = 0;

    if (ctx.chunkManager) {
      const stats = ctx.chunkManager.getStats();
      state.chunkStats = {
        loaded: stats.loadedChunks,
        pending: stats.pendingChunks,
        loading: stats.loadingChunks,
      };
    }
    if (terrainPhysics) {
      state.colliderCount = terrainPhysics.getColliderCount();
    }
    if (ctx.vegetationManager) {
      state.vegetationCount = ctx.vegetationManager.getStats();
    }
  }

  // Touch UI
  state.showTouchUI = ctx.inputCapabilities.shouldShowTouchUI();

  // Step physics
  if (physicsState.isInitialized && physicsState.world) {
    try {
      physicsState.world.timestep = Math.min(delta, 0.1);
      physicsState.world.step();
    } catch (e) {
      if (import.meta.hot) {
        console.debug("[WorldGameLoop] Physics step failed (likely HMR):", e);
        state.isDisposed = true;
      }
      return;
    }
  }

  // Shadow camera tracking
  if (ctx.sunLight && camera.current) {
    const camPos = camera.current.position;
    ctx.sunLight.position.set(camPos.x + 100, 200, camPos.z + 100);
    ctx.sunLight.target.position.set(camPos.x, 0, camPos.z);
    ctx.sunLight.target.updateMatrixWorld();
  }

  // Ground snap
  if (state.needsGroundSnap && terrainPhysics && state.groundSnapAttempts < MAX_GROUND_SNAP_ATTEMPTS) {
    state.groundSnapAttempts++;
    try {
      const count = terrainPhysics.getColliderCount();
      if (count > 0) {
        const snapped = snapToGround(physicsState, playerController, 1000);
        const pos = getPlayerPosition(playerController);
        if (snapped && pos && pos.y < 500) {
          state.needsGroundSnap = false;
          state.isReadyToRender = true;
        }
      }
    } catch (e) {
      if (import.meta.hot) {
        console.debug("[WorldGameLoop] Ground snap failed (likely HMR):", e);
        state.isDisposed = true;
      }
      return;
    }
  }

  // Underground recovery
  if (!state.needsGroundSnap && state.isReadyToRender) {
    try {
      const pos = getPlayerPosition(playerController);
      const minSafeHeight = (activeConfig.terrain.waterLevel ?? 5) + 2;
      if (pos && pos.y < minSafeHeight) {
        const spawnPos = activeConfig.spawn.position;
        teleportPlayer(playerController, { x: spawnPos[0], y: 500, z: spawnPos[2] });
        state.needsGroundSnap = true;
        state.groundSnapAttempts = 0;
        state.isReadyToRender = false;
        console.warn("[WorldGameLoop] Player was underground, teleporting to spawn");
      }
    } catch (e) {
      if (import.meta.hot) {
        console.debug("[WorldGameLoop] Position check failed (likely HMR):", e);
        state.isDisposed = true;
      }
      return;
    }
  }

  // Ground snap timeout
  if (state.needsGroundSnap && state.groundSnapAttempts >= MAX_GROUND_SNAP_ATTEMPTS) {
    console.warn("[WorldGameLoop] Ground snap timed out, rendering anyway");
    state.needsGroundSnap = false;
    state.isReadyToRender = true;
  }

  // Player position update
  try {
    const pos = getPlayerPosition(playerController);
    if (pos) {
      state.playerPosition = { x: pos.x, y: pos.y, z: pos.z };
      state.currentBiome = getBiome(worldNoise, pos.x, pos.z);
      if (state.zoneBoundary.length > 0) {
        state.isInsideZone = isPointInPolygon(pos.x, pos.z, state.zoneBoundary);
      }
    }
  } catch (e) {
    if (import.meta.hot) {
      console.debug("[WorldGameLoop] Position update failed (likely HMR):", e);
      state.isDisposed = true;
    }
    return;
  }

  // Chunk streaming
  if (camera.current) {
    const forward = new Vector3(0, 0, -1);
    forward.applyQuaternion(camera.current.quaternion);
    ctx.chunkManager?.updateWithDirection(
      camera.current.position.x,
      camera.current.position.y,
      camera.current.position.z,
      forward.x,
      forward.z
    );
  }

  // Vegetation
  ctx.vegetationManager?.rebuildDirtyBatches();

  // Atmosphere
  if (camera.current && camera.current instanceof PerspectiveCamera) {
    ctx.atmosphereManager?.update(camera.current);
  }

  // Water
  const time = performance.now() / 1000;
  if (camera.current) {
    ctx.waterManager?.update(time, camera.current.position.x, camera.current.position.z);
    ctx.drainageWaterManager?.update(time, camera.current.position.x, camera.current.position.z);
  }

  // Museum interaction
  if (ctx.isMuseumRealm && ctx.museumState.layout && camera.current && !ctx.museumState.isOverlayOpen) {
    const forward = new Vector3(0, 0, -1);
    forward.applyQuaternion(camera.current.quaternion);
    const allSlots = ctx.museumState.layout.pavilions.flatMap((p) => p.slots);
    const target = findInteractableSlot(
      state.playerPosition,
      { x: forward.x, y: forward.y, z: forward.z },
      allSlots
    );
    ctx.museumState.setInteractionTarget(target?.slot.id ?? null);
  }
}
