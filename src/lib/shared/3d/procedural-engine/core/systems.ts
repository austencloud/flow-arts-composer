/**
 * ECS Systems
 *
 * Systems are functions that operate on entities with specific components.
 * They run every frame in a defined order.
 *
 * Order:
 * 1. Input System - Read player input
 * 2. Physics System - Step simulation
 * 3. Movement System - Apply player movement
 * 4. Sync System - Sync ECS ↔ Physics ↔ Three.js
 * 5. Render System - Update meshes and camera
 */

import {
  withMesh,
  localPlayer,
  withLOD,
} from "./ecs-world";
// TODO: Physics modules not yet implemented
// import type { PhysicsWorldState } from "../physics/rapier-world";
// import { syncPhysicsToECS, syncECSToPhysics, checkGrounded } from "../physics/rapier-world";
// import {
//   type PlayerControllerState,
//   movePlayer,
//   getPlayerPosition,
// } from "../physics/player-controller";

// Stub types until physics is implemented
type PhysicsWorldState = {
  isInitialized: boolean;
  world: { timestep: number; step(): void } | null;
};
type PlayerControllerState = {
  controller: unknown;
  rigidBody: unknown;
  isGrounded: boolean;
  groundNormal: { x: number; y: number; z: number };
};
const syncPhysicsToECS = () => {};
const syncECSToPhysics = () => {};
const checkGrounded = () => false; // eslint-disable-line @typescript-eslint/no-unused-vars
const movePlayer = () => {};
const getPlayerPosition = () => new Vector3();
import type { PerspectiveCamera, Scene } from "three";
import { Vector3, Quaternion, Euler } from "three";
import { CameraMode } from "#lib/shared/3d/camera/types.js";
import { cameraPreferences } from "#lib/shared/3d/camera/camera-preferences.svelte.js";


/**
 * Shared context passed to all systems
 */
export interface SystemContext {
  deltaTime: number;
  time: number;
  physics: PhysicsWorldState;
  camera: PerspectiveCamera;
  scene: Scene;
  playerController: PlayerControllerState | null;
}


/**
 * Keyboard state
 */
const keyState: Record<string, boolean> = {};

/**
 * Mouse state
 */
let mouseDeltaX = 0;
let mouseDeltaY = 0;
let isPointerLocked = false;

/**
 * Initialize input listeners
 */
export function initInputSystem(canvas: HTMLCanvasElement): () => void {
  const handleKeyDown = (e: KeyboardEvent) => {
    keyState[e.code] = true;

    // V key toggles camera mode
    if (e.key.toLowerCase() === "v") {
      for (const entity of localPlayer.entities) {
        if (entity.camera) {
          // Toggle mode
          entity.camera.mode = entity.camera.mode === CameraMode.FIRST_PERSON
            ? CameraMode.THIRD_PERSON
            : CameraMode.FIRST_PERSON;

          // Save preference
          cameraPreferences.setModeForDestination("worlds", entity.camera.mode);
        }
      }
      e.preventDefault();
    }
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    keyState[e.code] = false;
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isPointerLocked) {
      mouseDeltaX += e.movementX;
      mouseDeltaY += e.movementY;
    }
  };

  const handlePointerLockChange = () => {
    isPointerLocked = document.pointerLockElement === canvas;
  };

  const handleClick = () => {
    if (!isPointerLocked) {
      canvas.requestPointerLock();
    }
  };

  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("pointerlockchange", handlePointerLockChange);
  canvas.addEventListener("click", handleClick);

  // Return cleanup function
  return () => {
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("keyup", handleKeyUp);
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("pointerlockchange", handlePointerLockChange);
    canvas.removeEventListener("click", handleClick);
  };
}

/**
 * Update input component from keyboard state
 */
export function inputSystem(_ctx: SystemContext): void {
  for (const entity of localPlayer.entities) {
    if (!entity.input) continue;

    entity.input.moveForward = keyState["KeyW"] || keyState["ArrowUp"] || false;
    entity.input.moveBackward = keyState["KeyS"] || keyState["ArrowDown"] || false;
    entity.input.moveLeft = keyState["KeyA"] || keyState["ArrowLeft"] || false;
    entity.input.moveRight = keyState["KeyD"] || keyState["ArrowRight"] || false;
    entity.input.jump = keyState["Space"] || false;
    entity.input.sprint = keyState["ShiftLeft"] || keyState["ShiftRight"] || false;
    entity.input.crouch = keyState["ControlLeft"] || keyState["ControlRight"] || false;
    entity.input.interact = keyState["KeyE"] || false;
  }
}

/**
 * Get and reset mouse delta
 */
export function consumeMouseDelta(): { x: number; y: number } {
  const delta = { x: mouseDeltaX, y: mouseDeltaY };
  mouseDeltaX = 0;
  mouseDeltaY = 0;
  return delta;
}

export function getPointerLocked(): boolean {
  return isPointerLocked;
}


const MOUSE_SENSITIVITY = 0.002;

/**
 * Update camera rotation from mouse input
 */
export function cameraSystem(ctx: SystemContext): void {
  if (!isPointerLocked) return;

  const delta = consumeMouseDelta();

  for (const entity of localPlayer.entities) {
    if (!entity.camera) continue;

    // Update rotation (same for both modes)
    entity.camera.yaw -= delta.x * MOUSE_SENSITIVITY;
    entity.camera.pitch -= delta.y * MOUSE_SENSITIVITY;

    // Clamp pitch to prevent flipping
    entity.camera.pitch = Math.max(
      -Math.PI / 2 + 0.01,
      Math.min(Math.PI / 2 - 0.01, entity.camera.pitch)
    );

    // Apply camera position/rotation based on mode
    if (entity.camera.mode === CameraMode.FIRST_PERSON) {
      // First-person: camera at player position
      const euler = new Euler(entity.camera.pitch, entity.camera.yaw, 0, "YXZ");
      ctx.camera.quaternion.setFromEuler(euler);
      // Position synced in renderSyncSystem
    } else {
      // Third-person: orbit behind player
      if (ctx.playerController) {
        const playerPos = getPlayerPosition();
        if (playerPos) {
          const distance = entity.camera.targetDistance;
          const height = entity.camera.targetHeight;

          const offsetX = -Math.sin(entity.camera.yaw) * distance;
          const offsetZ = -Math.cos(entity.camera.yaw) * distance;

          ctx.camera.position.set(
            playerPos.x + offsetX,
            playerPos.y + height,
            playerPos.z + offsetZ
          );

          // Look at player
          ctx.camera.lookAt(
            playerPos.x,
            playerPos.y + 1.7, // Eye height
            playerPos.z
          );
        }
      }
    }
  }
}


const MOVE_SPEED = 5;
const SPRINT_MULTIPLIER = 2;
const CROUCH_MULTIPLIER = 0.5;
const JUMP_FORCE = 8;
const GRAVITY = 25;
const PLAYER_HEIGHT = 1.7; // eslint-disable-line @typescript-eslint/no-unused-vars
const CROUCH_HEIGHT = 1.0; // eslint-disable-line @typescript-eslint/no-unused-vars

// Temporary vectors (reuse to avoid GC)
const moveDir = new Vector3();
const forward = new Vector3();
const right = new Vector3();

// Persistent vertical velocity for gravity/jumping
let verticalVelocity = 0;

/**
 * Apply player movement using Rapier character controller
 */
export function movementSystem(ctx: SystemContext): void {
  const pc = ctx.playerController;

  // Use physics-based movement if player controller is available
  if (pc?.controller && pc.rigidBody) {
    movementSystemPhysics(ctx);
    return;
  }

  // Fallback to non-physics movement (shouldn't happen in normal use)
  movementSystemFallback(ctx);
}

/**
 * Physics-based movement using Rapier character controller
 */
function movementSystemPhysics(ctx: SystemContext): void {
  const pc = ctx.playerController!;

  for (const entity of localPlayer.entities) {
    if (!entity.input || !entity.camera) continue;

    const input = entity.input;

    // Calculate movement direction from camera yaw
    const yaw = entity.camera.yaw;
    forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    right.set(Math.cos(yaw), 0, -Math.sin(yaw));

    // Build movement vector from input
    moveDir.set(0, 0, 0);
    if (input.moveForward) moveDir.add(forward);
    if (input.moveBackward) moveDir.sub(forward);
    if (input.moveRight) moveDir.add(right);
    if (input.moveLeft) moveDir.sub(right);

    // Apply speed modifiers
    let speed = MOVE_SPEED;
    if (input.sprint && !input.crouch) speed *= SPRINT_MULTIPLIER;
    if (input.crouch) speed *= CROUCH_MULTIPLIER;

    // Normalize and scale by deltaTime
    if (moveDir.lengthSq() > 0) {
      moveDir.normalize().multiplyScalar(speed * ctx.deltaTime);
    }

    if (input.jump && pc.isGrounded && verticalVelocity <= 0) {
      verticalVelocity = JUMP_FORCE;
    }

    if (!pc.isGrounded) {
      verticalVelocity -= GRAVITY * ctx.deltaTime;
      verticalVelocity = Math.max(verticalVelocity, -50); // Terminal velocity
    } else if (verticalVelocity < 0) {
      verticalVelocity = 0;
    }

    // Compute desired movement (horizontal + vertical)
    const desiredMovement = { // eslint-disable-line @typescript-eslint/no-unused-vars
      x: moveDir.x,
      y: verticalVelocity * ctx.deltaTime,
      z: moveDir.z,
    };

    // Move the player using character controller (stub until physics implemented)
    movePlayer();

    // Update grounded state from controller
    if (entity.grounded) {
      entity.grounded.isGrounded = pc.isGrounded;
      entity.grounded.groundNormal[0] = pc.groundNormal.x;
      entity.grounded.groundNormal[1] = pc.groundNormal.y;
      entity.grounded.groundNormal[2] = pc.groundNormal.z;
    }

    // Sync ECS transform from physics
    const playerPos = getPlayerPosition();
    if (playerPos && entity.transform) {
      entity.transform.position[0] = playerPos.x;
      entity.transform.position[1] = playerPos.y;
      entity.transform.position[2] = playerPos.z;
    }
  }
}

/**
 * Fallback movement without physics (for when physics isn't ready)
 */
function movementSystemFallback(ctx: SystemContext): void {
  for (const entity of localPlayer.entities) {
    if (!entity.input || !entity.transform || !entity.velocity || !entity.camera) continue;

    const input = entity.input;
    const transform = entity.transform;
    const velocity = entity.velocity;

    // Calculate movement direction from camera yaw
    const yaw = entity.camera.yaw;
    forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    right.set(Math.cos(yaw), 0, -Math.sin(yaw));

    // Build movement vector from input
    moveDir.set(0, 0, 0);
    if (input.moveForward) moveDir.add(forward);
    if (input.moveBackward) moveDir.sub(forward);
    if (input.moveRight) moveDir.add(right);
    if (input.moveLeft) moveDir.sub(right);

    // Apply speed modifiers
    let speed = MOVE_SPEED;
    if (input.sprint && !input.crouch) speed *= SPRINT_MULTIPLIER;
    if (input.crouch) speed *= CROUCH_MULTIPLIER;

    // Normalize and scale
    if (moveDir.lengthSq() > 0) {
      moveDir.normalize().multiplyScalar(speed);
    }

    // Set horizontal velocity
    velocity.linear[0] = moveDir.x;
    velocity.linear[2] = moveDir.z;

    // Simple gravity (no ground detection)
    velocity.linear[1] = (velocity.linear[1] ?? 0) - GRAVITY * ctx.deltaTime;

    // Apply velocity to position
    transform.position[0] = (transform.position[0] ?? 0) + (velocity.linear[0] ?? 0) * ctx.deltaTime;
    transform.position[1] = (transform.position[1] ?? 0) + (velocity.linear[1] ?? 0) * ctx.deltaTime;
    transform.position[2] = (transform.position[2] ?? 0) + (velocity.linear[2] ?? 0) * ctx.deltaTime;
  }
}


/**
 * Step physics simulation and sync with ECS
 */
export function physicsSystem(ctx: SystemContext): void {
  if (!ctx.physics.isInitialized || !ctx.physics.world) return;

  // Sync kinematic bodies from ECS to physics
  syncECSToPhysics();

  // Step simulation
  ctx.physics.world.timestep = ctx.deltaTime;
  ctx.physics.world.step();

  // Sync physics results back to ECS
  syncPhysicsToECS();
}


const tempPosition = new Vector3(); // eslint-disable-line @typescript-eslint/no-unused-vars
const tempQuaternion = new Quaternion(); // eslint-disable-line @typescript-eslint/no-unused-vars
const tempScale = new Vector3(); // eslint-disable-line @typescript-eslint/no-unused-vars

/**
 * Sync ECS transforms to Three.js objects
 */
export function renderSyncSystem(ctx: SystemContext): void {
  // Sync meshes
  for (const entity of withMesh.entities) {
    if (!entity.mesh || !entity.transform) continue;

    const transform = entity.transform;
    const obj = entity.mesh.object3D;

    // Update position
    obj.position.set(
      transform.position[0] ?? 0,
      transform.position[1] ?? 0,
      transform.position[2] ?? 0
    );

    obj.quaternion.set(
      transform.rotation[0] ?? 0,
      transform.rotation[1] ?? 0,
      transform.rotation[2] ?? 0,
      transform.rotation[3] ?? 1
    );

    obj.scale.set(
      transform.scale[0] ?? 1,
      transform.scale[1] ?? 1,
      transform.scale[2] ?? 1
    );

    // Update visibility
    obj.visible = entity.mesh.visible;
  }

  // Sync camera position from local player (ONLY in first-person mode)
  // In third-person, cameraSystem handles camera position
  for (const entity of localPlayer.entities) {
    if (!entity.transform || !entity.camera) continue;

    // Only sync camera position in first-person mode
    if (entity.camera.mode === CameraMode.FIRST_PERSON) {
      ctx.camera.position.set(
        entity.transform.position[0] ?? 0,
        entity.transform.position[1] ?? 0,
        entity.transform.position[2] ?? 0
      );
    }
  }
}


/**
 * Update LOD levels based on camera distance
 */
export function lodSystem(ctx: SystemContext): void {
  const cameraPos = ctx.camera.position;

  for (const entity of withLOD.entities) {
    if (!entity.transform || !entity.lod || !entity.mesh) continue;

    // Calculate distance to camera
    const dx = (entity.transform.position[0] ?? 0) - cameraPos.x;
    const dy = (entity.transform.position[1] ?? 0) - cameraPos.y;
    const dz = (entity.transform.position[2] ?? 0) - cameraPos.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Determine LOD level
    let newLOD = entity.lod.maxLOD;
    for (let i = 0; i < entity.lod.lodDistances.length; i++) {
      const threshold = entity.lod.lodDistances[i];
      if (threshold !== undefined && distance < threshold) {
        newLOD = i;
        break;
      }
    }

    if (newLOD !== entity.lod.currentLOD) {
      entity.lod.currentLOD = newLOD;
      // TODO: Trigger mesh swap based on LOD
    }
  }
}


/**
 * Run all systems in order
 */
export function runSystems(ctx: SystemContext): void {
  inputSystem(ctx);
  cameraSystem(ctx);
  movementSystem(ctx);
  physicsSystem(ctx);
  renderSyncSystem(ctx);
  lodSystem(ctx);
}
