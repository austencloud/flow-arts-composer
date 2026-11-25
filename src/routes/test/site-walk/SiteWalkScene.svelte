<script lang="ts">
  /**
   * Walking a site plan at true size.
   *
   * Everything here is borrowed from the jam: the Rapier world and the kinematic
   * player from `shared/3d/physics`, the walk and look from the shared
   * `UnifiedCameraController` (over the shoulder or at eye level, with weight,
   * sprint and a camera that stops at walls), the visible body from
   * `SiteWalkPlayer`, the roof from `peakedTent`, the crowd from
   * `JamCrowd`. The evening's light, sky and air come from `look/`: one recipe
   * per hour that everything reads. This file wires them to one flat
   * ground and the plan's solid things as static boxes. A Stand button
   * teleports the body and eases the view round through the controller's own
   * `externalYaw`, so the camera is never remounted.
   */
  import { onDestroy, onMount, untrack } from "svelte";
  import { T, useStage, useTask, useThrelte, type Stage } from "@threlte/core";
  import { CameraMode, UnifiedCameraController, createCameraPreferences } from "@austencloud/camera-3d";
  import type { AvatarState, CameraCollisionProbe, PhysicsProvider } from "@austencloud/camera-3d";
  import { DirectionalLight, type Camera, Vector3, type Scene, type Texture, type WebGLRenderer } from "three";
  import { castRay, createPhysicsWorldState, createRigidBody, disposePhysicsWorld, initPhysicsWorld, stepPhysics } from "#lib/shared/3d/physics/rapier-world.js";
  import { createPlayerController, disposePlayerController } from "#lib/shared/3d/physics/player-controller.js";
  import { createRapierPhysicsProvider } from "#lib/shared/3d/physics/rapier-physics-provider.js";
  import type { PhysicsWorldState, PlayerControllerState } from "#lib/shared/3d/physics/types.js";
  import { reducedMotion } from "#lib/shared/transitions/motion.js";
  import SiteWalkPlayer from "./SiteWalkPlayer.svelte";
  import type { JamAudio } from "../flow-fest-jam/flow-fest-jam-audio";
  import { jamAvatarFor } from "../flow-fest-jam/flow-fest-jam-people";
  import { buildSiteWalkMeshes, type SiteWalkMeshes } from "./site-walk-meshes";
  import { buildAroundMeshes, type AroundMeshes } from "./site-walk-around-meshes";
  import { surroundingColliders } from "./site-walk-around-colliders";
  import { fenceHeightOf, type SiteSurroundings } from "./site-walk-around";
  import { placePerformers, siteColliders, SITE_SIZES, type GuestFigure, type Pt, type SiteWalkWorld, type Stand } from "./site-walk-plan";
  import { siteFloor, type SiteFloor } from "./site-walk-floor";
  import { groundCollider, raisedCollider } from "./site-walk-raised";
  import SiteWalkFire from "./SiteWalkFire.svelte";
  import SiteWalkBlobs from "./SiteWalkBlobs.svelte";
  import SiteWalkGuests from "./SiteWalkGuests.svelte";
  import { SiteWalkBody } from "./site-walk-body";
  import { GaitWalker } from "#lib/shared/3d/locomotion/gait/gait-walker.js";
  import { BodyMoves, GRAVITY } from "#lib/shared/3d/locomotion/gait/body-moves.js";
  import { loadGaitClips, loadGaitGestures, type GestureName } from "#lib/shared/3d/locomotion/gait/gait-clips.js";
  import { spring, type Spring } from "#lib/shared/3d/locomotion/gait/gait-spring.js";
  import { BodyKeys, type BodyAsk } from "./site-walk-keys";
  import SiteWalkSky from "./look/SiteWalkSky.svelte";
  import SiteWalkComposer from "./look/SiteWalkComposer.svelte";
  import { LOOKS, directionOf } from "./look/site-walk-look";
  import { fitShadow, shadowMapSize } from "./look/site-walk-shadow-fit";
  import { refineSurfaces, type RefinedSurfaces } from "./look/site-walk-surfaces";
  import { loadDressing, type Dressing } from "./look/site-walk-dressing";

  /** Over the shoulder, or the honest eye-level sightline. */
  export type SiteView = "behind" | "eye";

  interface Props {
    world: SiteWalkWorld;
    light: "dusk" | "night";
    figures: readonly GuestFigure[];
    /** Each new token moves you to the spot and turns you to face its way. */
    stand: { spot: Stand; token: number };
    bannerTexture: Texture | null;
    /** The optional surroundings file: roads, buildings, trees, cars and the rest. */
    around?: SiteSurroundings | null;
    /** How high the floor is everywhere; flat without one. */
    floor?: SiteFloor | null;
    /** Fire performers on the stage, lit props and all. */
    fire: boolean;
    /** The jam's fire sound; follows the fire. Silent until the page turns it on after a click. */
    audio?: JamAudio;
    view: SiteView;
    onViewChange?: (view: SiteView) => void;
    /** Thumbstick, -1..1; z is forward. */
    moveAxis?: { x: number; z: number };
    /** A move asked for by a button; each new token asks once. */
    ask?: { what: BodyAsk; token: number } | null;
    /** True while a walk key is held. */
    onWalking?: (walking: boolean) => void;
    onReady?: () => void;
    onError?: (message: string) => void;
  }
  const props: Props = $props();

  const { scene, renderer, camera, mainStage, renderStage } = useThrelte() as unknown as {
    scene: Scene;
    renderer: WebGLRenderer;
    camera: { current: Camera };
    mainStage: Stage;
    renderStage: Stage;
  };
  const lookDirection = new Vector3();

  // The same body as the jam's player; the eye sits at 1.68 m.
  const PLAYER_RADIUS = 0.3;
  const PLAYER_HALF_HEIGHT = 0.55;
  const PLAYER_OFFSET = 0.02;
  const BODY_CENTRE_ABOVE_GROUND = PLAYER_HALF_HEIGHT + PLAYER_RADIUS + PLAYER_OFFSET;
  const EYE_HEIGHT = 1.68;
  const WALK_SPEED = 1.4;
  const RUN_FACTOR = 2.2;
  const CROUCH_FACTOR = 0.78;
  /** Running in a crouch, a little under the clip's own 2.6 m/s. */
  const CROUCH_RUN_SPEED = 2.5;
  /** The body's own height in a crouch, and in a slide or a roll: half its straight part, as PLAYER_HALF_HEIGHT. */
  const CROUCH_HALF_HEIGHT = 0.3;
  const LOW_HALF_HEIGHT = 0.1;
  /** Keeps the body on the ground it walks over, down steps and kerbs (m). */
  const SNAP_TO_GROUND = 0.2;
  /** How far off the ground it stands on the controller's own rounding can leave it (m). */
  const SETTLE = 0.07;
  /** What it keeps clear of the floor (m). On the floor exactly, the controller takes the floor itself for a step up. */
  const CLEAR = 0.002;
  /** How quickly the view follows the body's height down and up (half-life, s). */
  const VIEW_HEIGHT_HALF_LIFE = 0.09;
  /**
   * At eye level the view rides the body's own eyes, so every step, crouch,
   * jump and roll moves it as it moves the head. It is not eased: the head's
   * path is smooth, while easing its height over the feet alone kinks it at
   * every takeoff, where the rise passes from the legs to the whole body.
   * Where the head leans out toward a wall, the view stops this far short of
   * it (m), so the camera never looks through it.
   */
  const EYE_CLEAR = 0.12;
  /** How many times through a gesture goes. */
  const GESTURES: Record<GestureName, { whole: boolean; times: number }> = {
    wave: { whole: false, times: 4 },
    point: { whole: false, times: 1 },
    clap: { whole: false, times: 3 },
    cheer: { whole: false, times: 1 },
    bow: { whole: true, times: 1 },
  };
  const TURN_SECONDS = 0.35;
  /** The behind-the-shoulder boom: close for a small lot. */
  const BOOM = { start: 3.6, min: 2, max: 8 } as const;
  const BEHIND_PITCH = 0.22;
  const DESTINATION = "site-walk";
  const WALK_CODES = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
  const FIELD_HALF_EXTENT = 1500;

  let disposed = false;
  let physicsState: PhysicsWorldState | null = null;
  let playerState: PlayerControllerState | null = null;
  let physicsProvider = $state.raw<PhysicsProvider | null>(null);
  let meshes = $state.raw<SiteWalkMeshes | null>(null);
  let aroundMeshes = $state.raw<AroundMeshes | null>(null);
  let surfaces = $state.raw<RefinedSurfaces | null>(null);
  let dressing: Dressing | null = null;
  /** What the scene opens with; later changes arrive through effects. */
  const opening = untrack(() => ({
    spot: props.stand.spot,
    token: props.stand.token,
    view: props.view,
  }));
  let lastToken = opening.token;

  // The mode lives in the controller's own preferences; the bar's switch writes
  // the same value, so the V key and the switch stay in step with no remount.
  const modeOf = (view: SiteView) => (view === "eye" ? CameraMode.FIRST_PERSON : CameraMode.THIRD_PERSON);
  const cameraPreferences = createCameraPreferences("site-walk-camera", {
    [DESTINATION]: CameraMode.THIRD_PERSON,
  });
  cameraPreferences.setModeForDestination(DESTINATION, modeOf(opening.view));
  let cameraMode = $state<CameraMode>(modeOf(opening.view));
  $effect(() => {
    const wanted = modeOf(props.view);
    if (cameraPreferences.getModeForDestination(DESTINATION) !== wanted) cameraPreferences.setModeForDestination(DESTINATION, wanted);
  });

  // The body, as the jam feeds it.
  let playerPosition = $state({ x: 0, y: 0, z: 0 });
  let playerYaw = $state(opening.spot.yaw);
  let targetYaw = opening.spot.yaw;
  let isMoving = $state(false);
  let moveDirection = $state({ x: 0, z: 0 });
  /**
   * Behind the body, `SiteWalkBody` owns how it answers the keys: its speed,
   * its heading, and how it comes to rest after a key is let go. The
   * controller's own ramp is left off, so the keys reach it undelayed.
   * `walker` draws it: the pose follows from how far the body really moved.
   */
  const body = new SiteWalkBody(opening.spot.yaw);
  const walker = new GaitWalker();
  /** Jumping, crouching and the rest; null until the clips are in. */
  let moves: BodyMoves | null = null;
  const keys = new BodyKeys();
  /** Upward speed (m/s), and the ground speed last frame. */
  let rise = 0;
  let groundSpeed = 0;
  /**
   * Whether its feet are on something. Rapier calls anything within 5 cm
   * grounded, which is more than the first frame of a jump, so in the air only
   * a fall that something stops counts.
   */
  let standing = true;
  /** How high the body's centre stands over its feet now, and as the view follows it. */
  let centreHeight = BODY_CENTRE_ABOVE_GROUND;
  const viewHeight: Spring = { x: BODY_CENTRE_ABOVE_GROUND, v: 0 };
  /** At eye level: where the body's eyes are, and the feet it stands on this frame. */
  const eyeSeen = new Vector3();
  const feetAt = new Vector3();
  let floorY = 0;
  /** First person: the body's top turning speed, quick enough to feel direct. */
  const BODY_TURN_RATE = (360 * Math.PI) / 180;
  /** How long the body takes to settle a turn (s); it eases in and out, never snaps. */
  const BODY_TURN_SMOOTH = 0.14;
  let bodyTurnVelocity = 0;
  let viewYaw = opening.spot.yaw;
  let viewPitch = opening.view === "eye" ? 0 : BEHIND_PITCH;

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
      // The controller hands over the camera's heading. Behind the body it keeps its own
      // heading; the body turns toward where it travels (see the task below).
      cameraFacing = angle;
      if (cameraMode === CameraMode.FIRST_PERSON) targetYaw = angle;
    },
    snapFacingAngle(angle) {
      // At eye level the controller hands over the view's heading every
      // frame: the body turns with it and keeps its speed. A Stand button's
      // jump starts it standing (`standAt`).
      playerYaw = angle;
      targetYaw = angle;
      cameraFacing = angle;
    },
    updateLocomotion() {},
  };

  let cameraFacing = opening.spot.yaw;

  /** Facing `yaw`, standing still: where a Stand button or the opening puts the body. */
  function standAt(yaw: number): void {
    avatarState.snapFacingAngle?.(yaw);
    body.reset(yaw);
  }

  /**
   * Turn the body toward `targetYaw` on a critically damped spring capped at
   * BODY_TURN_RATE: the turn gathers speed and settles rather than starting
   * and stopping at full rate, which read as a snap from a standstill.
   */
  function stepBody(delta: number): void {
    if (delta <= 0) return;
    let d = targetYaw - playerYaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const omega = 2 / BODY_TURN_SMOOTH;
    const x = omega * delta;
    const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    // SmoothDamp with the body's heading as the origin and `d` as the target.
    const temp = (bodyTurnVelocity - omega * d) * delta;
    const cap = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
    const step = cap(d + (temp - d) * decay, BODY_TURN_RATE * delta);
    bodyTurnVelocity = cap((bodyTurnVelocity - omega * temp) * decay, BODY_TURN_RATE);
    playerYaw += step;
  }

  // A Stand button's turn: the controller adopts `externalYaw` while it is set.
  let turnYaw = $state<number | null>(null);
  let turnPitch = $state<number | null>(null);
  let turn: {
    from: number;
    by: number;
    fromPitch: number;
    toPitch: number;
    t: number;
  } | null = null;

  function handBack(): void {
    // On the next tick, so the last eased value lands first.
    queueMicrotask(() => {
      turnYaw = null;
      turnPitch = null;
    });
  }

  function startTurn(toYaw: number): void {
    const toPitch = cameraMode === CameraMode.FIRST_PERSON ? 0 : BEHIND_PITCH;
    let by = toYaw - viewYaw;
    while (by > Math.PI) by -= Math.PI * 2;
    while (by < -Math.PI) by += Math.PI * 2;
    if (reducedMotion()) {
      turn = null;
      turnYaw = viewYaw + by;
      turnPitch = toPitch;
      handBack();
      return;
    }
    turn = { from: viewYaw, by, fromPitch: viewPitch, toPitch, t: 0 };
  }

  function stepTurn(delta: number): void {
    if (!turn) return;
    turn.t = Math.min(1, turn.t + delta / TURN_SECONDS);
    const e = 1 - Math.pow(1 - turn.t, 3);
    turnYaw = turn.from + turn.by * e;
    turnPitch = turn.fromPitch + (turn.toPitch - turn.fromPitch) * e;
    if (turn.t >= 1) {
      turn = null;
      handBack();
    }
  }

  /** The camera stops at anything solid, through the same Rapier world the body walks in. */
  const probeCamera: CameraCollisionProbe = (origin, direction, maxDistance) => {
    if (!physicsState?.world || !playerState) return null;
    return castRay(physicsState, origin, direction, maxDistance, playerState.collider)?.distance ?? null;
  };

  // ------------------------------------------------------------------ light

  const look = $derived(LOOKS[props.light]);
  const centre = $derived({
    x: (props.world.bounds.minX + props.world.bounds.maxX) / 2,
    z: (props.world.bounds.minZ + props.world.bounds.maxZ) / 2,
  });

  /** The sun, or the moon. Everything else that lights the place is the sky itself (SiteWalkSky). */
  const keyLight = new DirectionalLight("#ffffff", 1);
  keyLight.castShadow = true;
  /** Enough to keep the fence wires and people's feet crisp over the whole lot; a quarter of that on a phone. */
  const SHADOW_PIXELS = window.matchMedia("(pointer: coarse)").matches ? 2048 * 2048 : 4096 * 4096;
  /** Nothing on a site plan stands taller than this (metres). */
  const SHADOW_HEIGHT = 9;
  keyLight.shadow.bias = -0.0002;
  keyLight.shadow.normalBias = 0.05;
  /** Soft contact blobs under every body: plain at Night, barely there at Dusk where the sun and the contact shade do it. */
  const blobStrength = $derived(props.light === "night" ? 0.6 : 0.14);

  $effect(() => {
    const { key } = look;
    const direction = directionOf(key.azimuth, key.elevation);
    keyLight.color.set(key.colour);
    keyLight.intensity = key.intensity;
    keyLight.shadow.radius = key.softness;
    const fit = fitShadow(direction, { ...props.world.bounds, height: SHADOW_HEIGHT });
    keyLight.position.copy(fit.position);
    keyLight.target.position.copy(fit.target);
    keyLight.target.updateMatrixWorld();
    const cam = keyLight.shadow.camera;
    cam.left = fit.left;
    cam.right = fit.right;
    cam.top = fit.top;
    cam.bottom = fit.bottom;
    cam.near = fit.near;
    cam.far = fit.far;
    cam.updateProjectionMatrix();
    const size = shadowMapSize(fit, SHADOW_PIXELS, renderer.capabilities.maxTextureSize);
    const { mapSize, map } = keyLight.shadow;
    if (mapSize.width !== size.width || mapSize.height !== size.height) {
      mapSize.set(size.width, size.height);
      map?.dispose();
      keyLight.shadow.map = null;
    }
  });

  // ------------------------------------------------------------------ fire

  const PERFORMER_SEED = 20261;
  const FIRE_PERFORMERS = 3;
  const performerSpots = $derived(
    props.world.stage
      ? placePerformers(props.world.stage, FIRE_PERFORMERS, {
          seed: PERFORMER_SEED,
        }).map((spot) => ({ ...spot, y: floor.heightAt(spot) }))
      : [],
  );
  /** The performers face the guests, or the lot's middle, or wherever you start. */
  const facingTarget = $derived<Pt>(props.world.stands.guests ?? props.world.lotCentre ?? props.world.stands.start);

  // ------------------------------------------------------------------ banner

  $effect(() => {
    meshes?.setBannerImage(props.bannerTexture);
  });

  $effect(() => {
    aroundMeshes?.setLight(props.light);
    surfaces?.setGlow(look.selfGlow);
  });

  // ------------------------------------------------------------------ physics

  const floor = $derived(props.floor ?? siteFloor(props.world, props.around ?? null));

  function bodyAt(spot: { x: number; z: number }) {
    return { x: spot.x, y: floor.heightAt(spot) + BODY_CENTRE_ABOVE_GROUND, z: spot.z };
  }

  async function build(): Promise<void> {
    const world = props.world;
    const around = props.around ?? null;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const dressed = await loadDressing(renderer, world, around, coarse);
    if (disposed) return dressed.dispose();
    dressing = dressed;
    meshes = buildSiteWalkMeshes(world, around, floor);
    aroundMeshes = dressed.around ? buildAroundMeshes(dressed.around, world, floor) : null;
    surfaces = refineSurfaces(renderer, meshes.root, aroundMeshes?.root ?? null, coarse ? 1024 : 2048, dressed.scans);
    for (const cars of dressed.cars) meshes.root.add(cars);

    physicsState = createPhysicsWorldState();
    await initPhysicsWorld(physicsState, { x: 0, y: -9.81, z: 0 });
    if (disposed || !physicsState.world) return;

    // Flat ground: one big static box whose top face is y = 0.
    createRigidBody(
      physicsState,
      { type: "static", position: { x: centre.x, y: -0.5, z: centre.z } },
      {
        type: "box",
        size: { x: FIELD_HALF_EXTENT * 2, y: 1, z: FIELD_HALF_EXTENT * 2 },
        friction: 0.8,
      },
    );
    // What stops you, and the camera: every solid thing the plan has.
    const colliders = [...siteColliders(world, { fenceHeight: fenceHeightOf(around), hidden: floor.hidden }), ...(around ? surroundingColliders(around, floor) : [])];
    // Raised areas: the same solid blocks you see, to stand on and walk into.
    const raised = raisedCollider(floor);
    if (raised) createRigidBody(physicsState, { type: "static", position: { x: 0, y: 0, z: 0 } }, { type: "trimesh", ...raised, friction: 0.8 });
    // The lawn where it rises off the flat ground, from the surroundings' grid of its heights.
    const lawn = groundCollider(floor);
    if (lawn) createRigidBody(physicsState, { type: "static", position: { x: 0, y: 0, z: 0 } }, { type: "trimesh", ...lawn, friction: 0.8 });
    for (const box of colliders) {
      createRigidBody(
        physicsState,
        {
          type: "static",
          position: { x: box.x, y: box.y, z: box.z },
          rotation: {
            x: 0,
            y: Math.sin(box.rotationY / 2),
            z: 0,
            w: Math.cos(box.rotationY / 2),
          },
        },
        { type: "box", size: { x: box.w, y: box.h, z: box.t }, friction: 0.2 },
      );
    }

    const spot = props.stand.spot;
    const start = bodyAt(spot);
    playerPosition = { ...start };
    standAt(spot.yaw);
    playerState = createPlayerController(physicsState, {
      radius: PLAYER_RADIUS,
      halfHeight: PLAYER_HALF_HEIGHT,
      offset: PLAYER_OFFSET,
      position: start,
      autoStepMaxHeight: SITE_SIZES.walkStepHeight,
    });
    // One step so the static boxes are in the query structure before the first move.
    stepPhysics(physicsState, 1 / 60);
    physicsProvider = steered(createRapierPhysicsProvider(physicsState, playerState));
    props.onReady?.();
  }

  /** The body as tall as it stands now, its feet where they were. */
  function standAs(halfHeight: number): void {
    const collider = playerState?.collider;
    const rigid = playerState?.rigidBody;
    if (!collider || !rigid) return;
    const by = halfHeight - collider.halfHeight();
    if (Math.abs(by) < 1e-4) return;
    collider.setHalfHeight(halfHeight);
    const at = rigid.translation();
    const to = { x: at.x, y: at.y + by, z: at.z };
    rigid.setTranslation(to, true);
    rigid.setNextKinematicTranslation(to);
    physicsState?.world?.propagateModifiedBodyPositionsToColliders();
    centreHeight = halfHeight + PLAYER_RADIUS + PLAYER_OFFSET;
  }

  /**
   * The body's feet on the floor it walks over, or stopped by the floor it
   * falls to; whether that moved a falling one. Pushing a moving capsule down
   * with the controller instead sinks it several centimetres into the floor.
   */
  function settle(falling: boolean): boolean {
    const rigid = playerState?.rigidBody;
    if (!physicsState || !rigid || !playerState?.collider) return false;
    if (!falling && !playerState.isGrounded) return false;
    const next = rigid.nextTranslation();
    const floor = castRay(physicsState, next, { x: 0, y: -1, z: 0 }, centreHeight + SETTLE, playerState.collider);
    if (floor === null) return false;
    const y = floor.point.y + centreHeight + CLEAR;
    if (falling ? next.y >= y : Math.abs(y - next.y) > SETTLE) return false;
    rigid.setNextKinematicTranslation({ x: next.x, y, z: next.z });
    return falling;
  }

  /** Whether nothing is over the body where it would stand up. */
  function roomToStand(): boolean {
    if (!physicsState || !playerState?.rigidBody || !playerState.collider) return true;
    const at = playerState.rigidBody.translation();
    const feet = at.y - centreHeight;
    const height = 2 * (PLAYER_HALF_HEIGHT + PLAYER_RADIUS);
    return castRay(physicsState, { x: at.x, y: at.y, z: at.z }, { x: 0, y: 1, z: 0 }, feet + height - at.y, playerState.collider) === null;
  }

  function floorUnder(x: number, y: number, z: number): number {
    if (!physicsState || !playerState?.collider) return 0;
    return castRay(physicsState, { x, y, z }, { x: 0, y: -1, z: 0 }, 20, playerState.collider)?.point.y ?? y - centreHeight;
  }

  /**
   * The physics body, moved by `SiteWalkBody` instead of straight by the keys,
   * with `BodyMoves` deciding what it is doing. The controller still owns
   * collisions and the camera; gravity is here, with the jump.
   */
  function steered(inner: PhysicsProvider): PhysicsProvider {
    const view = () => {
      const at = inner.getPlayerPosition();
      return { x: at.x, y: at.y - centreHeight + viewHeight.x, z: at.z };
    };
    return {
      movePlayer(desired, dt) {
        const grounded = standing;
        const eyeLevel = cameraMode === CameraMode.FIRST_PERSON;
        const want = dt > 0 ? { x: desired.x / dt, z: desired.z / dt } : { x: 0, z: 0 };
        const asked = Math.hypot(want.x, want.z);
        const pressed = keys.take();
        const doing = moves?.step({
          dt,
          grounded,
          speed: groundSpeed,
          rise,
          wantsMove: asked > 1e-3,
          sprinting: asked > WALK_SPEED * 1.05,
          jump: pressed.has("jump"),
          crouch: pressed.has("crouch"),
          roll: pressed.has("roll"),
          room: roomToStand,
          wantX: want.x,
          wantZ: want.z,
          yaw: eyeLevel ? null : body.yaw,
          feet: walker,
        });
        for (const what of pressed) if (what in GESTURES) startGesture(what as GestureName);
        const crouchSpeed = asked > WALK_SPEED * 1.05 ? CROUCH_RUN_SPEED : CROUCH_FACTOR * WALK_SPEED;
        const pace = doing?.crouched && asked > 1e-3 ? crouchSpeed / asked : 1;
        const out = body.step({
          wantX: want.x * pace,
          wantZ: want.z * pace,
          walkSpeed: WALK_SPEED,
          dt,
          planStop: (speed) => walker.planStop(speed),
          eyeLevel,
          cameraYaw: cameraFacing,
          air: doing?.air,
          drive: doing?.drive,
          planted: doing?.planted,
          crouched: doing?.crouched,
          turn: doing?.turn,
          turnRoom: (way, speed) => walker.turnRoom(way, speed),
        });

        standAs(doing?.low ? LOW_HALF_HEIGHT : doing?.crouched ? CROUCH_HALF_HEIGHT : PLAYER_HALF_HEIGHT);
        spring(viewHeight, centreHeight, VIEW_HEIGHT_HALF_LIFE, dt);
        const launched = doing?.launch ?? null;
        if (launched !== null) rise = launched;
        const off = launched !== null || !grounded;
        if (!off) rise = 0;
        // Held to the ground it walks over; let go of as soon as it leaves it, so nothing pulls it down early.
        if (off) playerState?.controller?.disableSnapToGround();
        else playerState?.controller?.enableSnapToGround(SNAP_TO_GROUND);
        const up = off ? rise * dt - 0.5 * GRAVITY * dt * dt : 0;
        const from = inner.getPlayerPosition();
        inner.movePlayer({ x: out.moveX, y: up, z: out.moveZ }, dt);
        const landed = (!off || up < 0) && settle(off);
        // The world takes the move now, so this frame draws it. Stepping at the
        // top of the next frame drew it late: after a dropped frame the body
        // lurched by the long frame's move in a short frame's time.
        if (physicsState && dt > 0) stepPhysics(physicsState, dt);
        if (!eyeLevel) playerYaw = body.yaw;
        const at = inner.getPlayerPosition();
        standing = off ? landed || (up < 0 && at.y - from.y > up + Math.min(1e-3, -up / 2)) : (playerState?.isGrounded ?? true);
        if (off) {
          rise -= GRAVITY * dt;
          // Its head met something.
          if (rise > 0 && at.y - from.y < up * 0.5) rise = 0;
        }
        if (dt > 0) groundSpeed = Math.hypot(at.x - from.x, at.z - from.z) / dt;
        playerPosition = view();
        floorY = floorUnder(at.x, at.y, at.z);
        feetAt.set(at.x, at.y - centreHeight, at.z);
        walker.put(dt, {
          x: at.x,
          groundY: at.y - centreHeight,
          z: at.z,
          yaw: body.yaw,
          stopping: out.stopping,
          crouched: doing?.crouched,
          move: doing?.move,
          lift: off ? rise : 0,
        });
      },
      getPlayerPosition: view,
      isGrounded: () => standing,
      getVelocity: () => inner.getVelocity(),
      teleport: (position) => {
        standAs(PLAYER_HALF_HEIGHT);
        viewHeight.x = centreHeight;
        viewHeight.v = 0;
        rise = 0;
        standing = true;
        moves?.reset();
        inner.teleport?.(position);
      },
      isNoclipEnabled: () => inner.isNoclipEnabled?.() ?? false,
    };
  }

  /**
   * At eye level, put the view in the body's eyes. This runs after every
   * other task, once the character has posed this frame's move: read before
   * the pose, the eyes lag the body by a frame and kick at every takeoff.
   * The controller still turns the view; only where it looks from changes.
   */
  function placeEyes(): void {
    if (cameraMode !== CameraMode.FIRST_PERSON || !walker.eyes(eyeSeen)) return;
    let x = eyeSeen.x - feetAt.x;
    let z = eyeSeen.z - feetAt.z;
    const out = Math.hypot(x, z);
    const wall =
      out > 1e-3 && physicsState?.world && playerState
        ? (castRay(physicsState, { x: feetAt.x, y: eyeSeen.y, z: feetAt.z }, { x: x / out, y: 0, z: z / out }, out + EYE_CLEAR, playerState.collider)?.distance ?? null)
        : null;
    if (wall !== null) {
      const room = Math.max(0, wall - EYE_CLEAR) / out;
      x *= room;
      z *= room;
    }
    camera.current.position.set(feetAt.x + x, eyeSeen.y, feetAt.z + z);
  }

  useTask(placeEyes, { stage: useStage("site-walk-eyes", { after: mainStage, before: renderStage }) });

  function startGesture(name: GestureName): void {
    loadGaitGestures()
      .then((clips) => walker.gesture(clips[name], GESTURES[name].whole, GESTURES[name].times))
      .catch((error: unknown) => console.error("[site walk] the gestures could not be loaded", error));
  }

  $effect(() => {
    const asked = props.ask;
    if (asked) keys.ask(asked.what);
  });

  onMount(() => {
    scene.add(keyLight, keyLight.target);
    loadGaitClips()
      .then((clips) => {
        moves = new BodyMoves(clips.moves);
        walker.use(clips);
      })
      .catch((error: unknown) => console.error("[site walk] the moves could not be loaded", error));
    const stopListening = keys.listen(window);
    build().catch((error: unknown) => {
      console.error("[site walk] the site could not be built", error);
      props.onError?.("The site could not be built.");
    });
    return stopListening;
  });

  // A Stand button was pressed: move there and turn to face its way.
  $effect(() => {
    const { spot, token } = props.stand;
    if (token === lastToken) return;
    lastToken = token;
    if (!physicsProvider) return;
    const at = bodyAt(spot);
    physicsProvider.teleport?.(new Vector3(at.x, at.y, at.z));
    playerPosition = { ...at };
    standAt(spot.yaw);
    startTurn(spot.yaw);
  });

  useTask((delta) => {
    if (disposed || !physicsState?.world) return;
    const dt = Math.min(Math.max(delta, 0), 1 / 30);
    stepTurn(delta);
    // Behind the body its heading is `SiteWalkBody`'s, set as it moves; at eye level it follows the view.
    if (cameraMode === CameraMode.FIRST_PERSON) {
      targetYaw = cameraFacing;
      stepBody(delta);
    }
    if (props.audio?.enabled) {
      const cam = camera.current;
      cam.getWorldDirection(lookDirection);
      props.audio.update({
        dt,
        listener: { x: cam.position.x, y: cam.position.y, z: cam.position.z },
        forward: { x: lookDirection.x, y: lookDirection.y, z: lookDirection.z },
        fires: props.fire ? performerSpots.map((spot) => ({ x: spot.x, y: spot.y, z: spot.z })) : [],
      });
    }
  });

  onDestroy(() => {
    disposed = true;
    scene.remove(keyLight, keyLight.target);
    surfaces?.dispose();
    dressing?.dispose();
    meshes?.dispose();
    aroundMeshes?.dispose();
    if (physicsState) {
      if (playerState) disposePlayerController(physicsState, playerState);
      disposePhysicsWorld(physicsState);
    }
  });
</script>

<T.PerspectiveCamera makeDefault fov={65} near={0.1} far={12000} position={[props.stand.spot.x, EYE_HEIGHT, props.stand.spot.z]} />

<SiteWalkSky {look} />
<SiteWalkComposer {look} />

{#if aroundMeshes}
  <T is={aroundMeshes.root} />
{/if}
{#if meshes}
  <T is={meshes.root} />
{/if}

{#if physicsProvider}
  <SiteWalkGuests figures={props.figures} sun={directionOf(look.key.azimuth, look.key.elevation)} />
  <SiteWalkBlobs points={props.figures} radius={0.5} strength={blobStrength} />
  {#if props.fire && performerSpots.length > 0}
    <SiteWalkBlobs points={performerSpots} radius={0.55} strength={blobStrength} />
  {/if}

  {#if props.fire && performerSpots.length > 0}
    <SiteWalkFire spots={performerSpots} toward={facingTarget} dark={props.light === "night" ? 1 : 0.15} />
  {/if}

  <UnifiedCameraController
    destinationId={DESTINATION}
    destinationDefaults={{ [DESTINATION]: CameraMode.THIRD_PERSON }}
    {cameraPreferences}
    {avatarState}
    {physicsProvider}
    cameraCollisionProbe={probeCamera}
    enabled={true}
    initialYaw={props.stand.spot.yaw}
    initialPitch={props.view === "eye" ? 0 : BEHIND_PITCH}
    externalYaw={turnYaw}
    externalPitch={turnPitch}
    allowedModes={[CameraMode.THIRD_PERSON, CameraMode.FIRST_PERSON]}
    disableModeToggle={false}
    showControlsHint={false}
    firstPersonCameraOffset={EYE_HEIGHT - BODY_CENTRE_ABOVE_GROUND}
    thirdPersonDistance={BOOM.start}
    thirdPersonMinDistance={BOOM.min}
    thirdPersonMaxDistance={BOOM.max}
    moveSpeed={WALK_SPEED}
    sprintMultiplier={RUN_FACTOR}
    moveAxis={props.moveAxis}
    jumpForce={0}
    gravity={9.81}
    enableSprint={true}
    enableJump={false}
    enableCrouch={false}
    enableNoclip={false}
    onModeChange={(mode) => {
      cameraMode = mode;
      props.onViewChange?.(mode === CameraMode.FIRST_PERSON ? "eye" : "behind");
    }}
    onRotationChange={(yaw, pitch) => {
      viewYaw = yaw;
      viewPitch = pitch;
    }}
    onInputStateChange={(input) => props.onWalking?.(input.activeCodes.some((c) => WALK_CODES.has(c)))}
  />

  <!-- After the controller, which moves the body: the character poses itself
       for this frame's move. Behind it, the body faces its travel, so it always
       walks forward; at eye level the view looks out of its head. -->
  <SiteWalkPlayer {walker} characterId={jamAvatarFor("player")} {blobStrength} floorUnder={() => floorY} />
{/if}
