<script lang="ts">
  /**
   * The Water Grotto — graybox.
   *
   * ONE question: is the box right? Does the room read as a room, is the pool
   * the right size, can you see all three stations from the apron before you go
   * down to any of them, does the sump compress and then release, and can you
   * tell where to go without being told.
   *
   * Walls, floor, ceiling. Nothing else. Austen (2026-08-11): "Gray box it. I'm
   * talking like boring af just walls floor, ceiling." The traverse got dressed
   * to a fourth-gate finish before its second gate was ever checked, and the
   * dressing is what hid the fact that the volume was a corridor. So: no water
   * surface, no steam, no vents, no performers, no palette. Three greys and one
   * instrument.
   *
   * Rules kept from the traverse graybox, because they were the good part:
   *   1. Every visible box is a collider, and every collider is a visible box.
   *   2. Material carries ROLE, not mood.
   *   3. Light is constant — a graybox that relights itself as you walk can
   *      only tell you the lighting is pretty.
   */
  import { onDestroy, onMount } from "svelte";
  import { T, useTask, useThrelte } from "@threlte/core";
  import {
    Color,
    DirectionalLight,
    DoubleSide,
    FogExp2,
    HemisphereLight,
    MeshBasicMaterial,
    MeshStandardMaterial,
    Quaternion,
  } from "three";
  import { CameraMode, UnifiedCameraController } from "@austencloud/camera-3d";
  import type { AvatarState, PhysicsProvider } from "@austencloud/camera-3d";
  import {
    MUSEUM_GRAVITY,
    MUSEUM_JUMP_VELOCITY,
  } from "#lib/features/museum/domain/museum-design-rules.js";
  import {
    createPhysicsWorldState,
    createRigidBody,
    disposePhysicsWorld,
    initPhysicsWorld,
    stepPhysics,
  } from "#lib/shared/3d/physics/rapier-world.js";
  import {
    createPlayerController,
    disposePlayerController,
  } from "#lib/shared/3d/physics/player-controller.js";
  import { createRapierPhysicsProvider } from "#lib/shared/3d/physics/rapier-physics-provider.js";
  import type {
    PhysicsWorldState,
    PlayerControllerState,
  } from "#lib/shared/3d/physics/types.js";
  import {
    EYE_ABOVE_FLOOR,
    grottoFloorAt,
  } from "#lib/features/water-traverse/data/water-grotto-terrain.js";
  import {
    buildWaterGrottoSetup,
    type RectCollider,
  } from "./water-grotto-colliders";

  interface Props {
    resetToken: number;
    onPositionChange?: (position: { x: number; y: number; z: number }) => void;
  }

  const props: Props = $props();
  const threlte = useThrelte();

  const { layout, colliders, spawn } = buildWaterGrottoSetup();


  /**
   * Three greys, separated by VALUE only, in the order a visitor reads a room:
   * the floor is brightest because you stand on it, the ceiling darkest because
   * no light reaches it, walls between. That ordering is what lets a still
   * frame answer "is this ceiling too low" without colour telling you where to
   * look.
   */
  /**
   * DoubleSide is not a style choice here, it is the difference between a room
   * and an empty void. The visitor stands INSIDE these boxes, so every wall and
   * ceiling face they look at is a back face — single-sided materials cull them
   * and the grotto renders as blackness with a lit floor wedge.
   */
  const GRAY = {
    floor: new MeshStandardMaterial({
      color: "#9aa0a3",
      roughness: 0.92,
      side: DoubleSide,
    }),
    wall: new MeshStandardMaterial({
      color: "#767c80",
      roughness: 0.95,
      side: DoubleSide,
    }),
    ceiling: new MeshStandardMaterial({
      color: "#6e7479",
      roughness: 0.98,
      side: DoubleSide,
    }),
  };

  /**
   * The one instrument: a human-height post where each performer stands.
   *
   * Not scenery, and deliberately not a platform. The traverse put them on
   * daises and the dais became the thing you had to get around. A post says
   * "somebody is standing here, at this height, on this surface" and says
   * nothing else.
   */
  const MARK = new MeshBasicMaterial({ color: "#e08640" });

  const ALL_MATERIALS = [...Object.values(GRAY), MARK];

  function materialFor(id: string): MeshStandardMaterial {
    if (id.includes("-ceiling")) return GRAY.ceiling;
    if (id.startsWith("hall-") || id.startsWith("sump-wall") || id.startsWith("pool-edge-"))
      return GRAY.wall;
    return GRAY.floor;
  }

  interface SurfaceMesh extends RectCollider {
    material: MeshStandardMaterial;
    quaternion: Quaternion;
  }

  const surfaces: SurfaceMesh[] = colliders.map((collider) => ({
    ...collider,
    material: materialFor(collider.id),
    quaternion: collider.rotation
      ? new Quaternion(
          collider.rotation.x,
          collider.rotation.y,
          collider.rotation.z,
          collider.rotation.w
        )
      : new Quaternion(),
  }));

  // ── Light: constant, everywhere ───────────────────────────────────────────

  const background = new Color("#11161a");
  const fog = new FogExp2("#11161a", 0.012);
  /**
   * The ground colour is doing a specific job: ceilings are the only surfaces
   * whose normals point down, so it is the ONLY light they get. Crushed to
   * near-black they read as void, and "is this roof too low" is one of the four
   * questions the graybox exists to answer — so it is lifted until a ceiling
   * reads as a surface at a height, rather than as an absence.
   */
  const hemi = new HemisphereLight("#c8d2d8", "#6d777e", 1.2);
  const sun = new DirectionalLight("#ffffff", 1.5);
  sun.position.set(18, 34, 12);
  const bounce = new DirectionalLight("#93a3ad", 0.5);
  bounce.position.set(-20, 12, -14);

  let physicsState: PhysicsWorldState | null = null;
  let playerState: PlayerControllerState | null = null;
  let physicsProvider = $state<PhysicsProvider | null>(null);
  let isInitialized = $state(false);
  let isDisposed = false;

  let playerPosition = $state({ x: spawn.x, y: spawn.y, z: spawn.z });
  let playerYaw = $state(spawn.yaw);
  let targetPlayerYaw = $state(spawn.yaw);
  let isMoving = $state(false);
  let moveDirection = $state({ x: 0, z: 0 });

  /**
   * UnifiedCameraController WRITES to this every frame — `position.x`, the
   * facing angle, the move input. Handing it a bare options bag
   * (`{ gravity, jumpVelocity }`) is not a lighter version of the contract, it
   * is a crash: `avatarState.position.x = targetX` throws on frame one, the
   * controller's task dies, and the camera is left at Threlte's default
   * (0, 0, 5) staring at the origin. The room renders perfectly and nothing is
   * looking at it, which reads exactly like a geometry bug and is not one.
   */
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
      return moveDirection;
    },
    setMoveInput(input) {
      moveDirection = input;
      isMoving = input.x !== 0 || input.z !== 0;
    },
    updateMovement() {},
    setFacingAngle(angle) {
      targetPlayerYaw = angle;
    },
    snapFacingAngle(angle) {
      playerYaw = angle;
      targetPlayerYaw = angle;
    },
    updateLocomotion(delta) {
      let difference = targetPlayerYaw - playerYaw;
      while (difference > Math.PI) difference -= Math.PI * 2;
      while (difference < -Math.PI) difference += Math.PI * 2;
      const step = Math.min(Math.abs(difference), 12 * delta);
      playerYaw += Math.sign(difference) * step;
    },
  };

  const UNSEEN_RESET_TOKEN = -1;
  let appliedResetToken = UNSEEN_RESET_TOKEN;

  function teleport(x: number, y: number, z: number): void {
    if (!physicsState || !playerState) return;
    playerState.rigidBody?.setTranslation({ x, y, z }, true);
    playerPosition = { x, y, z };
    props.onPositionChange?.(playerPosition);
  }

  function resetPlayer(): void {
    teleport(spawn.x, spawn.y, spawn.z);
  }

  /**
   * Dev-only review bridge.
   *
   * An agent verifying its own diff cannot take pointer lock, so without this
   * the only frame anyone can capture is the spawn point. `stand` puts the eye
   * on the floor at any (x, z) in the room — a room needs both axes, which is
   * the one thing the traverse's z-only version could not do.
   */
  function installReviewBridge(): (() => void) | undefined {
    if (!import.meta.env.DEV || typeof window === "undefined") return;
    const bridge = {
      /** Stand on the floor at (x, z), eye height derived from the terrain. */
      stand(x: number, z: number) {
        reviewAim = null;
        const y = grottoFloorAt(x, z) + EYE_ABOVE_FLOOR;
        teleport(x, y, z);
        return { x, y, z };
      },
      go(x: number, y: number, z: number) {
        reviewAim = null;
        teleport(x, y, z);
        return { x, y, z };
      },
      /**
       * Aim at a world point. Detaches the camera from the controller, so
       * `release()` must be called before handing the walk back to a person —
       * a detached camera cannot look around, which is a maddening thing to
       * leave behind.
       */
      lookAt(x: number, z: number, y?: number) {
        const yaw = Math.atan2(x - playerPosition.x, z - playerPosition.z);
        const pitch =
          y === undefined
            ? 0
            : Math.atan2(
                y - playerPosition.y,
                Math.hypot(x - playerPosition.x, z - playerPosition.z)
              );
        reviewAim = { yaw, pitch };
        return { yaw, pitch };
      },
      aim(yaw: number, pitch = 0) {
        reviewAim = { yaw, pitch };
        return { yaw, pitch };
      },
      release() {
        reviewAim = null;
        return true;
      },
      where: () => ({ ...playerPosition }),
      /**
       * What is ACTUALLY being drawn, as opposed to what the physics body
       * thinks. `where()` reports the rigid body; if the two disagree, the
       * camera is not following the walk and every screenshot is a lie.
       */
      debug() {
        const cam = threlte.camera.current;
        const scene = threlte.scene;
        let meshes = 0;
        scene?.traverse((object) => {
          if ((object as { isMesh?: boolean }).isMesh) meshes += 1;
        });
        const info = threlte.renderer?.info.render;
        return {
          body: { ...playerPosition },
          camera: cam
            ? { type: cam.type, x: cam.position.x, y: cam.position.y, z: cam.position.z }
            : null,
          meshes,
          sceneChildren: scene?.children.length ?? 0,
          drawCalls: info?.calls ?? null,
          triangles: info?.triangles ?? null,
        };
      },
      reset: () => {
        reviewAim = null;
        resetPlayer();
        return { ...playerPosition };
      },
      layout,
    };
    (window as unknown as Record<string, unknown>).__grotto = bridge;
    return () => {
      delete (window as unknown as Record<string, unknown>).__grotto;
    };
  }

  let removeReviewBridge: (() => void) | undefined;

  onMount(async () => {
    removeReviewBridge = installReviewBridge();

    physicsState = createPhysicsWorldState();
    await initPhysicsWorld(physicsState, { x: 0, y: -9.81, z: 0 });
    if (isDisposed || !physicsState) return;

    for (const collider of colliders) {
      createRigidBody(
        physicsState,
        {
          type: "static",
          position: {
            x: collider.position[0],
            y: collider.position[1],
            z: collider.position[2],
          },
          ...(collider.rotation ? { rotation: collider.rotation } : {}),
        },
        {
          type: "box",
          size: {
            x: collider.size[0],
            y: collider.size[1],
            z: collider.size[2],
          },
        }
      );
    }

    playerState = createPlayerController(physicsState, {
      position: { x: spawn.x, y: spawn.y, z: spawn.z },
      autoStepMaxHeight: 0.45,
      snapToGroundDistance: 0.35,
    });
    physicsProvider = createRapierPhysicsProvider(physicsState, playerState);
    isInitialized = true;
  });

  $effect(() => {
    if (!isInitialized) return;
    if (appliedResetToken === UNSEEN_RESET_TOKEN) {
      appliedResetToken = props.resetToken;
      return;
    }
    if (props.resetToken === appliedResetToken) return;
    appliedResetToken = props.resetToken;
    resetPlayer();
  });

  let reviewAim = $state<{ yaw: number; pitch: number } | null>(null);

  useTask(() => {
    const aim = reviewAim;
    const cam = threlte.camera.current;
    if (!aim || !cam) return;
    const cosPitch = Math.cos(aim.pitch);
    cam.position.set(playerPosition.x, playerPosition.y, playerPosition.z);
    cam.lookAt(
      playerPosition.x + Math.sin(aim.yaw) * cosPitch,
      playerPosition.y + Math.sin(aim.pitch),
      playerPosition.z + Math.cos(aim.yaw) * cosPitch
    );
  });

  useTask((delta) => {
    if (!isInitialized || !physicsState?.world || isDisposed) return;
    stepPhysics(physicsState, Math.min(delta, 1 / 30));
    const position = physicsProvider?.getPlayerPosition();
    if (!position) return;
    props.onPositionChange?.(position);
    playerPosition = position;
    sun.target.position.set(position.x, position.y, position.z);
    sun.position.set(position.x + 18, position.y + 34, position.z + 12);
    bounce.target.position.set(position.x, position.y, position.z);
    bounce.position.set(position.x - 20, position.y + 12, position.z - 14);
  });

  onDestroy(() => {
    isDisposed = true;
    removeReviewBridge?.();
    if (playerState && physicsState) {
      disposePlayerController(physicsState, playerState);
    }
    if (physicsState) disposePhysicsWorld(physicsState);
    ALL_MATERIALS.forEach((material) => material.dispose());
    sun.dispose();
    bounce.dispose();
    hemi.dispose();
  });
</script>

<T is={background} attach="background" />
<T is={fog} attach="fog" />
<T is={hemi} />
<T is={sun} castShadow />
<T is={sun.target} />
<T is={bounce} />
<T is={bounce.target} />

<!-- The room: every collider, drawn as the box it is. -->
{#each surfaces as surface (surface.id)}
  <T.Mesh
    position={surface.position}
    quaternion={[
      surface.quaternion.x,
      surface.quaternion.y,
      surface.quaternion.z,
      surface.quaternion.w,
    ]}
    receiveShadow
    castShadow
  >
    <T.BoxGeometry args={surface.size} />
    <T is={surface.material} />
  </T.Mesh>
{/each}

<!-- Where each performer stands. A post, at human height, on the local floor. -->
{#each layout.performers as performer (performer.id)}
  <T.Mesh
    position={[performer.x, performer.y + 0.9, performer.z]}
    castShadow
  >
    <T.BoxGeometry args={[0.5, 1.8, 0.3]} />
    <T is={MARK} />
  </T.Mesh>
{/each}

{#if isInitialized && physicsProvider}
  <UnifiedCameraController
    destinationId="water-grotto-walk"
    {avatarState}
    {physicsProvider}
    enabled={reviewAim === null}
    initialYaw={spawn.yaw}
    initialPitch={0}
    allowedModes={[CameraMode.FIRST_PERSON]}
    disableModeToggle={true}
    moveSpeed={4.2}
    sprintMultiplier={2.2}
    gravity={MUSEUM_GRAVITY}
    jumpForce={MUSEUM_JUMP_VELOCITY}
  />
{/if}
