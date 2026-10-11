<script lang="ts">
  /**
   * IndoorSceneContent
   *
   * Inner component that runs inside the Threlte Canvas context (via GalleryCanvas).
   * Handles Rapier physics initialization, creates colliders from room geometry,
   * and renders walls/floor/ceiling meshes.
   *
   * Uses UnifiedCameraController (the same one Museum/Realm use) for all
   * camera, input, movement, jumping, and pointer lock handling.
   */

  import { onMount, onDestroy, type Snippet } from "svelte";
  import { T, useTask } from "@threlte/core";
  import { DoubleSide } from "three";

  // Physics
  import {
    createPhysicsWorldState,
    initPhysicsWorld,
    disposePhysicsWorld,
    stepPhysics,
  } from "#lib/shared/3d/physics/rapier-world.js";
  import { createRigidBody } from "#lib/shared/3d/physics/rapier-world.js";
  import type { PhysicsWorldState, PlayerControllerState } from "#lib/shared/3d/physics/types.js";
  import {
    createPlayerController,
    disposePlayerController,
  } from "#lib/shared/3d/physics/player-controller.js";
  import { createRapierPhysicsProvider } from "#lib/shared/3d/physics/rapier-physics-provider.js";

  // Camera - use the SAME controller as Museum/Realm
  import { UnifiedCameraController, CameraMode } from "@austencloud/camera-3d";
  import type { AvatarState, PhysicsProvider } from "@austencloud/camera-3d";
  import { cameraPreferences } from "#lib/shared/3d/camera/camera-preferences.svelte.js";
  import { getInputCapabilities } from "#lib/shared/input/InputCapabilities.svelte.js";

  // Room types and materials
  import type { SolvedRoom } from "./domain/room-types";
  import {
    getWallMaterial,
    getFloorMaterial,
    getCeilingMaterial,
  } from "./domain/material-registry";


  interface Props {
    room: SolvedRoom;
    eyeHeight?: number;
    moveSpeed?: number;
    gravity?: number;
    onPositionChange?: (pos: { x: number; y: number; z: number }) => void;
    children: Snippet;
  }

  const props: Props = $props();


  let physicsState: PhysicsWorldState | null = null;
  let playerState: PlayerControllerState | null = null;
  let physicsProvider = $state<PhysicsProvider | null>(null);
  let isDisposed = false;
  let isInitialized = $state(false);

  // Player state (reactive, read by UCC)
  // Use $derived so the compiler tracks props.room as a reactive prop read
  const offset = $derived(props.room.worldOffset);
  const spawnX = $derived(props.room.spawnPoint.x + offset.x);
  const spawnY = $derived(props.room.spawnPoint.y + offset.y);
  const spawnZ = $derived(props.room.spawnPoint.z + offset.z);

  let playerPosition = $state({ x: 0, y: 0, z: 0 });
  let playerYaw = $state(0);
  let targetPlayerYaw = $state(0);
  $effect.pre(() => {
    playerPosition = { x: spawnX, y: spawnY, z: spawnZ };
    playerYaw = props.room.spawnFacing;
    targetPlayerYaw = props.room.spawnFacing;
  });
  let isMoving = $state(false);
  let cameraMode = $state(CameraMode.FIRST_PERSON);
  const ROTATION_SPEED = 12;

  const inputCapabilities = getInputCapabilities();

  // Raw WASD input for directional animation blending
  let moveDir = $state({ x: 0, z: 0 });

  // AvatarState adapter - same pattern as WorldScene.svelte
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


  onMount(async () => {
    // 1. Initialize physics world
    physicsState = createPhysicsWorldState();
    await initPhysicsWorld(physicsState, { x: 0, y: props.gravity ?? -9.81, z: 0 });

    if (isDisposed) return;

    // 2. Create static colliders for room geometry
    for (const collider of props.room.colliders) {
      createRigidBody(
        physicsState,
        {
          type: "static",
          position: {
            x: collider.position[0] + offset.x,
            y: collider.position[1] + offset.y,
            z: collider.position[2] + offset.z,
          },
        },
        {
          type: "box",
          size: {
            x: collider.size[0],
            y: collider.size[1],
            z: collider.size[2],
          },
        },
      );
    }

    // 3. Create player controller at spawn point
    playerState = createPlayerController(physicsState, {
      position: { x: spawnX, y: spawnY, z: spawnZ },
    });

    // 4. Create physics provider for UnifiedCameraController
    physicsProvider = createRapierPhysicsProvider(physicsState, playerState);

    isInitialized = true;
  });

  // FRAME LOOP (physics only - UCC handles its own camera/input loop)

  useTask((delta) => {
    if (!isInitialized || !physicsState?.world || isDisposed) return;

    // Step physics
    stepPhysics(physicsState, Math.min(delta, 1 / 30));

    // Report position to parent
    props.onPositionChange?.(playerPosition);
  });


  onDestroy(() => {
    isDisposed = true;

    if (playerState && physicsState) {
      disposePlayerController(physicsState, playerState);
    }

    if (physicsState) {
      disposePhysicsWorld(physicsState);
    }
  });


  const wallMats = $derived(
    props.room.walls.map((w) => getWallMaterial(w.materialId)),
  );
  const floorMat = $derived(getFloorMaterial(props.room.floor.materialId));
  const ceilingMat = $derived(getCeilingMaterial(props.room.ceiling.materialId));

  const ox = $derived(props.room.worldOffset.x);
  const oy = $derived(props.room.worldOffset.y);
  const oz = $derived(props.room.worldOffset.z);
</script>

<!-- UnifiedCameraController - handles ALL input, camera, movement, jumping, pointer lock -->
{#if isInitialized && physicsProvider}
  <UnifiedCameraController
    destinationId="archive"
    {avatarState}
    {physicsProvider}
    {cameraPreferences}
    enabled={true}
    initialYaw={props.room.spawnFacing}
    onModeChange={(mode: CameraMode) => {
      cameraMode = mode;
    }}
    onRotationChange={(newYaw: number, _pitch: number) => {
      playerYaw = newYaw;
    }}
  />
{/if}

<!-- Walls -->
{#each props.room.walls as wall, i}
  <T.Mesh
    position.x={wall.position[0] + ox}
    position.y={wall.position[1] + oy}
    position.z={wall.position[2] + oz}
    rotation.y={wall.rotationY}
  >
    <T.BoxGeometry args={wall.size} />
    <T.MeshStandardMaterial
      color={wallMats[i]?.color}
      roughness={wallMats[i]?.roughness}
      metalness={wallMats[i]?.metalness}
      side={DoubleSide}
    />
  </T.Mesh>
{/each}

<!-- Floor -->
<T.Mesh
  position.x={props.room.floor.position[0] + ox}
  position.y={props.room.floor.position[1] + oy}
  position.z={props.room.floor.position[2] + oz}
>
  <T.BoxGeometry args={props.room.floor.size} />
  <T.MeshStandardMaterial
    color={floorMat.color}
    roughness={floorMat.roughness}
    metalness={floorMat.metalness}
    side={DoubleSide}
  />
</T.Mesh>

<!-- Ceiling -->
<T.Mesh
  position.x={props.room.ceiling.position[0] + ox}
  position.y={props.room.ceiling.position[1] + oy}
  position.z={props.room.ceiling.position[2] + oz}
>
  <T.BoxGeometry args={props.room.ceiling.size} />
  <T.MeshStandardMaterial
    color={ceilingMat.color}
    roughness={ceilingMat.roughness}
    metalness={ceilingMat.metalness}
    side={DoubleSide}
  />
</T.Mesh>

<!-- Entrance wall segments (flanking the opening) -->
{#each props.room.entrance.segments as seg}
  {@const mat = getWallMaterial(seg.materialId)}
  <T.Mesh
    position.x={seg.position[0] + ox}
    position.y={seg.position[1] + oy}
    position.z={seg.position[2] + oz}
    rotation.y={seg.rotationY}
  >
    <T.BoxGeometry args={seg.size} />
    <T.MeshStandardMaterial
      color={mat.color}
      roughness={mat.roughness}
      metalness={mat.metalness}
      side={DoubleSide}
    />
  </T.Mesh>
{/each}

<!-- Corridor (if present) -->
{#if props.room.entrance.corridor}
  <!-- Corridor walls -->
  {#each props.room.entrance.corridor.walls as cWall}
    {@const mat = getWallMaterial(cWall.materialId)}
    <T.Mesh
      position.x={cWall.position[0] + ox}
      position.y={cWall.position[1] + oy}
      position.z={cWall.position[2] + oz}
      rotation.y={cWall.rotationY}
    >
      <T.BoxGeometry args={cWall.size} />
      <T.MeshStandardMaterial
        color={mat.color}
        roughness={mat.roughness}
        metalness={mat.metalness}
        side={DoubleSide}
      />
    </T.Mesh>
  {/each}

  <!-- Corridor floor -->
  {@const corridorFloorMat = getFloorMaterial(props.room.entrance.corridor.floor.materialId)}
  <T.Mesh
    position.x={props.room.entrance.corridor.floor.position[0] + ox}
    position.y={props.room.entrance.corridor.floor.position[1] + oy}
    position.z={props.room.entrance.corridor.floor.position[2] + oz}
  >
    <T.BoxGeometry args={props.room.entrance.corridor.floor.size} />
    <T.MeshStandardMaterial
      color={corridorFloorMat.color}
      roughness={corridorFloorMat.roughness}
      metalness={corridorFloorMat.metalness}
      side={DoubleSide}
    />
  </T.Mesh>

  <!-- Corridor ceiling -->
  {@const corridorCeilMat = getCeilingMaterial(props.room.entrance.corridor.ceiling.materialId)}
  <T.Mesh
    position.x={props.room.entrance.corridor.ceiling.position[0] + ox}
    position.y={props.room.entrance.corridor.ceiling.position[1] + oy}
    position.z={props.room.entrance.corridor.ceiling.position[2] + oz}
  >
    <T.BoxGeometry args={props.room.entrance.corridor.ceiling.size} />
    <T.MeshStandardMaterial
      color={corridorCeilMat.color}
      roughness={corridorCeilMat.roughness}
      metalness={corridorCeilMat.metalness}
      side={DoubleSide}
    />
  </T.Mesh>
{/if}

<!-- Wing-specific content (pedestals, displays, lights, etc.) -->
{@render props.children()}
