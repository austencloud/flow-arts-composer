<script lang="ts">
  /**
   * Walking a site plan at true size.
   *
   * Everything here is borrowed from the jam: the Rapier world and the kinematic
   * player from `shared/3d/physics`, the walk and look from the shared
   * `UnifiedCameraController` (over the shoulder or at eye level, with weight,
   * sprint and a camera that stops at walls), the visible body from
   * `FlowFestOnFootPlayer`, the evening's light and sky from
   * `flow-fest-jam-light` with `SkyGradient` and `Starfield`, the roof from
   * `peakedTent`, the crowd from `JamCrowd`. This file wires them to one flat
   * ground and the plan's solid things as static boxes. A Stand button
   * teleports the body and eases the view round through the controller's own
   * `externalYaw`, so the camera is never remounted.
   */
  import { onDestroy, onMount, untrack } from "svelte";
  import { T, useTask, useThrelte } from "@threlte/core";
  import { CameraMode, UnifiedCameraController, createCameraPreferences } from "@austencloud/camera-3d";
  import type { AvatarState, CameraCollisionProbe, PhysicsProvider } from "@austencloud/camera-3d";
  import { AmbientLight, DirectionalLight, type Camera, FogExp2, HemisphereLight, Vector3, type Scene, type Texture, type WebGLRenderer } from "three";
  import { castRay, createPhysicsWorldState, createRigidBody, disposePhysicsWorld, initPhysicsWorld, stepPhysics } from "#lib/shared/3d/physics/rapier-world.js";
  import { createPlayerController, disposePlayerController } from "#lib/shared/3d/physics/player-controller.js";
  import { createRapierPhysicsProvider } from "#lib/shared/3d/physics/rapier-physics-provider.js";
  import type { PhysicsWorldState, PlayerControllerState } from "#lib/shared/3d/physics/types.js";
  import { reducedMotion } from "#lib/shared/transitions/motion.js";
  import SkyGradient from "#lib/shared/3d/environments/primitives/SkyGradient.svelte";
  import Starfield from "#lib/shared/3d/environments/primitives/Starfield.svelte";
  import FlowFestOnFootPlayer from "../flow-fest-graybox/FlowFestOnFootPlayer.svelte";
  import type { JamAudio } from "../flow-fest-jam/flow-fest-jam-audio";
  import { JAM_MOON_DIRECTION, jamLightAt, jamSunDirection } from "../flow-fest-jam/flow-fest-jam-light";
  import { jamAvatarFor } from "../flow-fest-jam/flow-fest-jam-people";
  import { buildSiteWalkMeshes, type SiteWalkMeshes } from "./site-walk-meshes";
  import { buildAroundMeshes, type AroundMeshes } from "./site-walk-around-meshes";
  import { surroundingColliders } from "./site-walk-around-colliders";
  import { fenceHeightOf, type SiteSurroundings } from "./site-walk-around";
  import { placePerformers, siteColliders, SITE_SIZES, type GuestFigure, type Pt, type SiteWalkWorld, type Stand } from "./site-walk-plan";
  import SiteWalkFire from "./SiteWalkFire.svelte";
  import SiteWalkBlobs from "./SiteWalkBlobs.svelte";
  import SiteWalkGuests from "./SiteWalkGuests.svelte";

  /** The two lights: sun elevations fed to the jam's light owner. */
  export const DUSK_ELEVATION = 2;
  export const NIGHT_ELEVATION = -11;

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
    /** Fire performers on the stage, lit props and all. */
    fire: boolean;
    /** The jam's fire sound; follows the fire. Silent until the page turns it on after a click. */
    audio?: JamAudio;
    view: SiteView;
    onViewChange?: (view: SiteView) => void;
    /** Thumbstick, -1..1; z is forward. */
    moveAxis?: { x: number; z: number };
    /** True while a walk key is held. */
    onWalking?: (walking: boolean) => void;
    onReady?: () => void;
    onError?: (message: string) => void;
  }
  const props: Props = $props();

  const { scene, renderer, camera } = useThrelte() as unknown as {
    scene: Scene;
    renderer: WebGLRenderer;
    camera: { current: Camera };
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
  /** The body eases up to speed and settles to a stop (m/s^2). */
  const ACCELERATION = 8;
  const DECELERATION = 10;
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
  let groundSpeed = $state(0);
  /** About 540 degrees a second: quick enough to feel direct, slow enough to read as a turn. */
  const BODY_TURN_RATE = (540 * Math.PI) / 180;
  /** Below this the body is standing, so it keeps its heading rather than chasing a drift. */
  const TRAVEL_SPEED_MIN = 0.4;
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
      playerYaw = angle;
      targetYaw = angle;
    },
    updateLocomotion() {},
  };

  let cameraFacing = opening.spot.yaw;

  /** Turn the body toward `targetYaw` at no more than TURN_RATE, never a snap. */
  function stepBody(delta: number): void {
    let d = targetYaw - playerYaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    playerYaw += Math.sign(d) * Math.min(Math.abs(d), BODY_TURN_RATE * delta);
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

  const elevation = $derived(props.light === "night" ? NIGHT_ELEVATION : DUSK_ELEVATION);
  const light = $derived(jamLightAt(elevation));
  const sunDirection = $derived(jamSunDirection(elevation));
  const centre = $derived({
    x: (props.world.bounds.minX + props.world.bounds.maxX) / 2,
    z: (props.world.bounds.minZ + props.world.bounds.maxZ) / 2,
  });
  const reach = $derived(Math.max(props.world.bounds.maxX - props.world.bounds.minX, props.world.bounds.maxZ - props.world.bounds.minZ, 30));

  const keyLight = new DirectionalLight("#ffffff", 1);
  keyLight.castShadow = true;
  // 4096 over the lot's span keeps the fence wires and people's feet crisp under a low sun.
  keyLight.shadow.mapSize.set(4096, 4096);
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 600;
  keyLight.shadow.bias = -0.0002;
  keyLight.shadow.normalBias = 0.05;
  const hemi = new HemisphereLight("#9fb4d0", "#3a3226", 0.6);
  /** A dim cool floor under the jam's own light, so the site reads at night. */
  const floorLight = new AmbientLight("#6a7fa3", 0.2);
  /** Soft contact blobs under every body: plain at Night, light at Dusk where the sun's shadows already show. */
  const blobStrength = $derived(props.light === "night" ? 0.85 : 0.3);
  const fog = new FogExp2("#a08672", 0.002);
  const direction = new Vector3();

  $effect(() => {
    const l = light;
    const moon = props.light === "night";
    direction.set(...(moon ? JAM_MOON_DIRECTION : sunDirection)).normalize();
    keyLight.color.set(moon ? l.moonColor : l.sunColor);
    keyLight.intensity = moon ? l.moonIntensity : l.sunIntensity;
    keyLight.position.set(centre.x + direction.x * 200, direction.y * 200, centre.z + direction.z * 200);
    keyLight.target.position.set(centre.x, 0, centre.z);
    keyLight.target.updateMatrixWorld();
    const half = Math.min(120, Math.max(25, reach * 0.65));
    const cam = keyLight.shadow.camera;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.updateProjectionMatrix();
    hemi.color.set(l.hemiSky);
    hemi.groundColor.set(l.hemiGround);
    // Dusk keeps people readable at ten metres: more sky and floor light than the jam's own dusk.
    hemi.intensity = moon ? l.hemiIntensity : l.hemiIntensity * 1.6;
    // With the fire's own lights on stage the cool floor drops, but the zones still read.
    floorLight.intensity = moon ? (props.fire ? 0.38 : 0.62) : 0.6;
    fog.color.set(l.fogColor);
    // A touch of haze low over the ground at night, thicker where fire is burning.
    // The far ground melts into the sky colour instead of ending in a dark edge.
    fog.density = Math.max(l.fogDensity, 0.0028) * (moon ? (props.fire ? 1.3 : 1.15) : 1);
    renderer.toneMappingExposure = l.exposure;
  });

  // ------------------------------------------------------------------ fire

  const PERFORMER_SEED = 20261;
  const FIRE_PERFORMERS = 3;
  const performerSpots = $derived(
    props.world.stage
      ? placePerformers(props.world.stage, FIRE_PERFORMERS, {
          seed: PERFORMER_SEED,
        })
      : [],
  );
  /** The performers face the guests, or the lot's middle, or wherever you start. */
  const facingTarget = $derived<Pt>(props.world.stands.guests ?? props.world.lotCentre ?? props.world.stands.start);

  const starConfig = $derived({
    enabled: light.stars > 0.02,
    count: 2600,
    radius: 4000,
    sizeRange: [0.6, 2.2] as [number, number],
    twinkleSpeed: 0.6,
    intensity: Math.round(light.stars * 20) / 20,
    horizonSpread: 0.5,
  });

  // ------------------------------------------------------------------ banner

  $effect(() => {
    meshes?.setBannerImage(props.bannerTexture);
  });

  $effect(() => {
    aroundMeshes?.setLight(props.light);
  });

  // ------------------------------------------------------------------ physics

  function bodyAt(spot: { x: number; z: number }) {
    return { x: spot.x, y: BODY_CENTRE_ABOVE_GROUND, z: spot.z };
  }

  async function build(): Promise<void> {
    const world = props.world;
    const around = props.around ?? null;
    meshes = buildSiteWalkMeshes(world, around);
    aroundMeshes = around ? buildAroundMeshes(around, world) : null;

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
    const colliders = [...siteColliders(world, { fenceHeight: fenceHeightOf(around) }), ...(around ? surroundingColliders(around) : [])];
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
    avatarState.snapFacingAngle?.(spot.yaw);
    playerState = createPlayerController(physicsState, {
      radius: PLAYER_RADIUS,
      halfHeight: PLAYER_HALF_HEIGHT,
      offset: PLAYER_OFFSET,
      position: start,
      autoStepMaxHeight: SITE_SIZES.walkStepHeight,
    });
    // One step so the static boxes are in the query structure before the first move.
    stepPhysics(physicsState, 1 / 60);
    physicsProvider = createRapierPhysicsProvider(physicsState, playerState);
    props.onReady?.();
  }

  onMount(() => {
    scene.fog = fog;
    scene.add(keyLight, keyLight.target, hemi, floorLight);
    build().catch((error: unknown) => {
      console.error("[site walk] the site could not be built", error);
      props.onError?.("The site could not be built.");
    });
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
    avatarState.snapFacingAngle?.(spot.yaw);
    startTurn(spot.yaw);
  });

  useTask((delta) => {
    if (disposed || !physicsState?.world) return;
    const dt = Math.min(Math.max(delta, 0), 1 / 30);
    stepPhysics(physicsState, dt);
    stepTurn(delta);
    if (physicsProvider) {
      const next = physicsProvider.getPlayerPosition();
      playerPosition = { x: next.x, y: next.y, z: next.z };
      const v = physicsProvider.getVelocity();
      groundSpeed += (Math.hypot(v.x, v.z) - groundSpeed) * (1 - Math.exp(-12 * Math.max(dt, 1e-4)));
      // Behind the body it faces its travel direction, so W walks away from the camera, S turns it
      // toward the camera, and A and D turn it; it never sidesteps or backpedals.
      if (cameraMode === CameraMode.FIRST_PERSON) targetYaw = cameraFacing;
      else if (Math.hypot(v.x, v.z) > TRAVEL_SPEED_MIN) targetYaw = Math.atan2(v.x, v.z);
    }
    stepBody(delta);
    if (props.audio?.enabled) {
      const cam = camera.current;
      cam.getWorldDirection(lookDirection);
      props.audio.update({
        dt,
        listener: { x: cam.position.x, y: cam.position.y, z: cam.position.z },
        forward: { x: lookDirection.x, y: lookDirection.y, z: lookDirection.z },
        fires: props.fire ? performerSpots.map((spot) => ({ x: spot.x, y: 0, z: spot.z })) : [],
      });
    }
  });

  onDestroy(() => {
    disposed = true;
    scene.remove(keyLight, keyLight.target, hemi, floorLight);
    if (scene.fog === fog) scene.fog = null;
    meshes?.dispose();
    aroundMeshes?.dispose();
    if (physicsState) {
      if (playerState) disposePlayerController(physicsState, playerState);
      disposePhysicsWorld(physicsState);
    }
  });
</script>

<T.PerspectiveCamera makeDefault fov={65} near={0.1} far={12000} position={[props.stand.spot.x, EYE_HEIGHT, props.stand.spot.z]} />

<SkyGradient
  topColor={light.skyTop}
  midColor={light.skyMid}
  bottomColor={light.skyBottom}
  radius={9000}
  gradientStart={0.22}
  gradientEnd={0.92}
  sun={{
    enabled: elevation > -1.2,
    direction: sunDirection,
    color: light.sunColor,
    angularDiameterDegrees: 0.9,
    glowScale: 6,
    glowOpacity: 0.55,
  }}
  horizonGlow={{
    color: light.horizonGlow,
    direction: jamSunDirection(Math.min(elevation, 0)),
    height: 0.32,
    spread: 0.35,
    intensity: light.horizonGlowIntensity,
  }}
  moon={{
    enabled: true,
    texture: "/textures/moon.png",
    direction: JAM_MOON_DIRECTION,
    angularDiameterDegrees: 0.9,
    opacity: props.light === "night" ? 0.8 : 0.15,
    glowScale: 3.2,
    glowOpacity: props.light === "night" ? 0.25 : 0.12,
  }}
/>
<Starfield config={starConfig} />

{#if aroundMeshes}
  <T is={aroundMeshes.root} />
{/if}
{#if meshes}
  <T is={meshes.root} />
{/if}

{#if physicsProvider}
  <SiteWalkGuests figures={props.figures} />
  <SiteWalkBlobs points={props.figures} radius={0.5} strength={blobStrength} />
  {#if props.fire && performerSpots.length > 0}
    <SiteWalkBlobs points={performerSpots} radius={0.55} strength={blobStrength} />
  {/if}
  {#if cameraMode === CameraMode.THIRD_PERSON}
    <SiteWalkBlobs points={[playerPosition]} radius={0.5} strength={blobStrength} />
  {/if}

  {#if props.fire && performerSpots.length > 0}
    <SiteWalkFire spots={performerSpots} toward={facingTarget} dark={props.light === "night" ? 1 : 0.15} />
  {/if}

  {#if cameraMode === CameraMode.THIRD_PERSON}
    <FlowFestOnFootPlayer
      position={playerPosition}
      bodyCentreAboveGroundMeters={BODY_CENTRE_ABOVE_GROUND}
      facingAngle={playerYaw}
      {isMoving}
      moveSpeedMetersPerSecond={groundSpeed}
      moveDirection={isMoving ? { x: 0, z: -1 } : { x: 0, z: 0 }}
      characterId={jamAvatarFor("player")}
    />
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
    groundAcceleration={ACCELERATION}
    groundDeceleration={DECELERATION}
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
{/if}
