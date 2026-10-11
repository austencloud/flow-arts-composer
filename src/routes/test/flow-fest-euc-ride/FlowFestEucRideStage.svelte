<script lang="ts">
  /**
   * Free-ride behavior lab.
   *
   * The pose harness feeds the vehicle constant synthetic dynamics, so it can
   * prove a contact pose but can never reproduce a ride-time twitch. This
   * stage drives the PRODUCTION `FlowFestElectricUnicycleDrive` — the same
   * keyboard mapping, substep integrator, and collision reconciliation the sim
   * runs — over an ideal flat plane, so any jitter seen here is the vehicle
   * stack's own, with terrain, Rapier, and the camera controller ruled out.
   *
   * The flat plane stands in for Rapier: the base provider grants every
   * requested movement and reports it back as the actual velocity, which makes
   * `reconcileFlowFestEucCollision` a pass-through. That is the point — the
   * dynamics loop still runs through the exact production code path.
   */
  import { T, useTask } from "@threlte/core";
  import {
    Color,
    Vector3,
    type DirectionalLight,
    type PerspectiveCamera,
  } from "three";
  import type { PhysicsProvider, Vector3 as ProviderVector3 } from "@austencloud/camera-3d";
  import {
    FLOW_FEST_EUC_CONFIG,
    wrapFlowFestEucAngle,
    type FlowFestElectricUnicycleDynamics,
    type FlowFestElectricUnicycleInput,
    type FlowFestElectricUnicycleTerrainAttitude,
  } from "#lib/features/flow-fest-sim/domain/flow-fest-electric-unicycle.js";
  import type { FlowFestEucMountedPoseDiagnostic } from "#lib/features/flow-fest-sim/domain/flow-fest-euc-mounted-pose.js";
  import { FlowFestElectricUnicycleDrive } from "#lib/features/flow-fest-sim/services/flow-fest-electric-unicycle-drive.js";
  import FlowFestElectricUnicycle from "../flow-fest-sim/FlowFestElectricUnicycle.svelte";
  import type { EucRideCameraId, EucRideTelemetry } from "./euc-ride-telemetry";
  import { createEucRideTwitchMeter } from "./euc-ride-telemetry";

  interface Props {
    cameraId: EucRideCameraId;
    rough: boolean;
    onTelemetry: (telemetry: EucRideTelemetry) => void;
    onPoseDiagnostic: (diagnostic: FlowFestEucMountedPoseDiagnostic) => void;
  }

  const props: Props = $props();

  const background = new Color("#12161c");

  /** Grants every requested movement on an infinite level plane. */
  class FlatGroundProvider implements PhysicsProvider {
    private readonly position = { x: 0, y: 0, z: 0 };
    private readonly velocity = { x: 0, y: 0, z: 0 };

    movePlayer(desiredMovement: ProviderVector3, deltaTime: number): void {
      this.position.x += desiredMovement.x;
      this.position.z += desiredMovement.z;
      const safeDelta = Math.max(deltaTime, 1e-6);
      this.velocity.x = desiredMovement.x / safeDelta;
      this.velocity.y = 0;
      this.velocity.z = desiredMovement.z / safeDelta;
    }

    getPlayerPosition(): ProviderVector3 {
      return { ...this.position };
    }

    isGrounded(): boolean {
      return true;
    }

    getVelocity(): ProviderVector3 {
      return { ...this.velocity };
    }

    teleport(position: ProviderVector3): void {
      this.position.x = position.x;
      this.position.y = position.y;
      this.position.z = position.z;
      this.velocity.x = 0;
      this.velocity.y = 0;
      this.velocity.z = 0;
    }
  }

  const flatGround = new FlatGroundProvider();
  const twitchMeter = createEucRideTwitchMeter();

  let dynamics = $state<FlowFestElectricUnicycleDynamics | null>(null);
  let input = $state<FlowFestElectricUnicycleInput | null>(null);
  let collisionLimited = false;
  let longitudinalAcceleration = 0;

  const drive = new FlowFestElectricUnicycleDrive(
    flatGround,
    { headingRadians: 0 },
    (frame) => {
      dynamics = frame.dynamics;
      input = frame.input;
      collisionLimited = frame.collisionLimited;
      longitudinalAcceleration =
        frame.longitudinalAccelerationMetersPerSecondSquared;
    }
  );

  const activeCodes = new Set<string>();

  $effect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.repeat) return;
      activeCodes.add(event.code);
      if (event.code.startsWith("Arrow")) event.preventDefault();
    };
    const up = (event: KeyboardEvent) => {
      activeCodes.delete(event.code);
    };
    const blur = () => {
      activeCodes.clear();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  });

  export function reset(): void {
    drive.teleport({ x: 0, y: 0, z: 0 });
  }

  const terrainAttitude: FlowFestElectricUnicycleTerrainAttitude = $derived({
    pitchRadians: 0,
    rollRadians: 0,
    // The same bump the pose harness uses, so suspension travel is on display
    // without inventing a second roughness convention.
    roughnessMeters: props.rough ? 0.05 : 0,
  });

  let wheelPosition = $state({ x: 0, y: 0, z: 0 });
  let poseDiagnostic: FlowFestEucMountedPoseDiagnostic | null = null;

  let cameraRef = $state<PerspectiveCamera | null>(null);
  let sunRef = $state<DirectionalLight | null>(null);
  let chaseYawRadians = 0;
  const cameraTarget = new Vector3();

  function handlePoseDiagnostic(
    diagnostic: FlowFestEucMountedPoseDiagnostic
  ): void {
    poseDiagnostic = diagnostic;
    props.onPoseDiagnostic(diagnostic);
  }

  useTask((delta) => {
    drive.setKeyboardCodes([...activeCodes]);
    drive.movePlayer({ x: 0, y: 0, z: 0 }, delta);
    const position = flatGround.getPlayerPosition();
    wheelPosition = { x: position.x, y: 0, z: position.z };

    const snappedGridX = snap(position.x, GRID_CELL_METERS);
    const snappedGridZ = snap(position.z, GRID_CELL_METERS);
    if (snappedGridX !== gridOrigin.x || snappedGridZ !== gridOrigin.z) {
      gridOrigin = { x: snappedGridX, z: snappedGridZ };
    }
    const snappedPostX = snap(position.x, POST_CELL_METERS);
    const snappedPostZ = snap(position.z, POST_CELL_METERS);
    if (snappedPostX !== postFieldOrigin.x || snappedPostZ !== postFieldOrigin.z) {
      postFieldOrigin = { x: snappedPostX, z: snappedPostZ };
    }
    const sun = sunRef;
    if (sun) {
      // The shadow frustum is only ~48m wide, so the sun rig re-centers on the
      // snapped grid origin; snapping keeps the shadow camera from swimming.
      sun.position.set(gridOrigin.x + 14, 22, gridOrigin.z + 16);
      sun.target.position.set(gridOrigin.x, 0, gridOrigin.z);
      sun.target.updateMatrixWorld();
    }

    const state = drive.snapshot();
    const twitch = twitchMeter.sample(delta, state, poseDiagnostic);
    props.onTelemetry({
      dynamics: state,
      input: drive.inputSnapshot(),
      collisionLimited,
      longitudinalAccelerationMetersPerSecondSquared: longitudinalAcceleration,
      twitch,
    });

    const camera = cameraRef;
    if (!camera) return;
    const heading = state.headingRadians;
    if (props.cameraId === "chase") {
      // The sim's chase behavior lives in the camera package; the lab wants a
      // deterministic stand-in with the same character — damped yaw follow at
      // the production chase pitch — so camera smoothing cannot be mistaken
      // for rider motion.
      const blend = 1 - Math.exp(-5 * delta);
      chaseYawRadians +=
        wrapFlowFestEucAngle(heading - chaseYawRadians) * blend;
      const distance = 4.6;
      camera.position.set(
        wheelPosition.x - Math.sin(chaseYawRadians) * distance,
        wheelPosition.y +
          distance * Math.tan(FLOW_FEST_EUC_CONFIG.chaseCameraPitchRadians) +
          1.35,
        wheelPosition.z - Math.cos(chaseYawRadians) * distance
      );
      cameraTarget.set(
        wheelPosition.x,
        wheelPosition.y + 1.1,
        wheelPosition.z
      );
    } else {
      // Rigid side follow, perpendicular to travel: the frame moves exactly
      // with the wheel, so any residual rider motion IS rider motion.
      chaseYawRadians = heading;
      const side = 4.4;
      camera.position.set(
        wheelPosition.x - Math.cos(heading) * side,
        wheelPosition.y + 1.15,
        wheelPosition.z + Math.sin(heading) * side
      );
      cameraTarget.set(
        wheelPosition.x,
        wheelPosition.y + 0.95,
        wheelPosition.z
      );
    }
    camera.lookAt(cameraTarget);
  });

  /**
   * Endless ground dressing. The uniform plane follows the wheel exactly (no
   * visible seams on a solid color), while the grid and the post field snap to
   * their own cell pitch so they read as world-fixed: crossing a cell boundary
   * shifts them by exactly one repeat, which is invisible. Post heights hash
   * from the world cell so each post keeps its height as the field re-centers.
   */
  const GRID_CELL_METERS = 4;
  const POST_CELL_METERS = 22;
  const POST_FIELD_HALF_CELLS = 4;

  let postFieldOrigin = $state({ x: 0, z: 0 });
  let gridOrigin = $state({ x: 0, z: 0 });

  function snap(value: number, pitch: number): number {
    return Math.round(value / pitch) * pitch;
  }

  function postHeightMeters(cellX: number, cellZ: number): number {
    const hash = Math.abs(Math.sin(cellX * 374761.393 + cellZ * 668265.263));
    return 1.05 + (hash % 1) * 0.85;
  }

  const posts = $derived.by(() => {
    const origin = postFieldOrigin;
    const field: Array<{ key: string; x: number; z: number; heightMeters: number }> = [];
    for (let dx = -POST_FIELD_HALF_CELLS; dx <= POST_FIELD_HALF_CELLS; dx += 1) {
      for (let dz = -POST_FIELD_HALF_CELLS; dz <= POST_FIELD_HALF_CELLS; dz += 1) {
        const x = origin.x + dx * POST_CELL_METERS;
        const z = origin.z + dz * POST_CELL_METERS;
        // Keep the immediate riding lane clear of the spawn cell's post.
        if (Math.abs(x) < 2 && Math.abs(z) < 2) continue;
        field.push({
          key: `${x}:${z}`,
          x,
          z,
          heightMeters: postHeightMeters(
            Math.round(x / POST_CELL_METERS),
            Math.round(z / POST_CELL_METERS)
          ),
        });
      }
    }
    return field;
  });
</script>

<T is={background} attach="background" />

<T.PerspectiveCamera
  bind:ref={cameraRef}
  makeDefault
  position={[0, 2.6, -4.6]}
  fov={44}
  near={0.05}
  far={220}
/>

<T.Mesh
  position={[wheelPosition.x, 0, wheelPosition.z]}
  rotation.x={-Math.PI / 2}
  receiveShadow
>
  <T.CircleGeometry args={[140, 96]} />
  <T.MeshStandardMaterial color="#39414d" roughness={0.95} metalness={0.02} />
</T.Mesh>
<T.GridHelper
  args={[240, 60, "#222831", "#1f2630"]}
  position={[gridOrigin.x, 0.002, gridOrigin.z]}
/>
{#each posts as post (post.key)}
  <T.Mesh position={[post.x, post.heightMeters / 2, post.z]} castShadow>
    <T.CylinderGeometry args={[0.05, 0.07, post.heightMeters, 8]} />
    <T.MeshStandardMaterial color="#8d99ab" roughness={0.8} />
  </T.Mesh>
{/each}

<T.HemisphereLight color="#dfe9ff" groundColor="#2b3038" intensity={1.55} />
<T.DirectionalLight
  bind:ref={sunRef}
  position={[14, 22, 16]}
  intensity={2.4}
  castShadow
  shadow.mapSize.width={2048}
  shadow.mapSize.height={2048}
  shadow.camera.left={-24}
  shadow.camera.right={24}
  shadow.camera.top={24}
  shadow.camera.bottom={-24}
  shadow.camera.near={0.5}
  shadow.camera.far={70}
/>
<T.DirectionalLight position={[-16, 10, -14]} intensity={0.7} />

{#if dynamics && input}
  <FlowFestElectricUnicycle
    position={wheelPosition}
    {dynamics}
    {terrainAttitude}
    mounted={true}
    lightsOn={false}
    longitudinalAccelerationMetersPerSecondSquared={longitudinalAcceleration}
    onMountedPoseDiagnostic={handlePoseDiagnostic}
  />
{:else}
  <FlowFestElectricUnicycle
    position={wheelPosition}
    dynamics={drive.snapshot()}
    {terrainAttitude}
    mounted={true}
    lightsOn={false}
    onMountedPoseDiagnostic={handlePoseDiagnostic}
  />
{/if}
