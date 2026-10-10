<script lang="ts">
  /** Shared fixed-shot and first-person camera for environment review routes. */
  import { onDestroy } from "svelte";
  import { T, useTask, useThrelte } from "@threlte/core";
  import { Vector3, type Object3D } from "three";
  import type CameraControls from "camera-controls";
  import {
    CAMERA_DEFAULTS,
    CameraMode,
    UnifiedCameraController,
    createKinematicPhysicsProvider,
    createViewerCameraPlayerState,
  } from "@austencloud/camera-3d";
  import OrbitControls from "#lib/shared/3d/components/OrbitControls.svelte";
  import {
    DEFAULT_ENVIRONMENT_REVIEW_BOUNDS,
    collectEnvironmentCameraCollisionMeshes,
    keepEnvironmentReviewOrbitAboveSurface,
    resolveEnvironmentReviewWalkPose,
    type EnvironmentReviewBounds,
    type EnvironmentReviewCameraPreset,
  } from "./environment-review-camera";
  import { setCameraUrlPose } from "#lib/shared/3d/domain/camera-url-pose.js";

  interface Props {
    destinationId: string;
    preset: EnvironmentReviewCameraPreset;
    walk?: boolean;
    walkBounds?: EnvironmentReviewBounds;
    maxOrbitDistance?: number;
    /** Keep normal review orbit on the authored side of tagged terrain. */
    terrainSafeOrbit?: boolean;
  }

  let {
    destinationId,
    preset,
    walk = false,
    walkBounds = DEFAULT_ENVIRONMENT_REVIEW_BOUNDS,
    maxOrbitDistance = 70,
    terrainSafeOrbit = false,
  }: Props = $props();

  const { scene } = useThrelte();

  const walkPose = resolveEnvironmentReviewWalkPose(preset);
  const cameraPlayer = createViewerCameraPlayerState({
    spawnX: walkPose.playerPosition.x,
    spawnY: walkPose.playerPosition.y,
    spawnZ: walkPose.playerPosition.z,
    initialFacing: walkPose.yaw,
  });
  const physicsProvider = createKinematicPhysicsProvider(
    cameraPlayer.avatarState.position as { x: number; y: number; z: number },
    {
      groundY: walkPose.playerPosition.y,
      bounds: walkBounds,
    }
  );
  const destinationDefaults = { [destinationId]: CameraMode.FIRST_PERSON };

  // Orbit-mode pose sync: mirror the live camera into ?cam=/?look= so a
  // refresh restores the exact view and the URL itself communicates "the
  // thing I am looking at". Raw history.replaceState on purpose - routing
  // through SvelteKit's reactive page.url would recompute the preset and
  // snap the camera to the rounded pose on every write.
  const scratchPosition = new Vector3();
  const scratchTarget = new Vector3();
  let poseSyncTimer: ReturnType<typeof setTimeout> | null = null;
  let orbitControls = $state<CameraControls | null>(null);
  let collisionMeshes = $state<Object3D[]>([]);
  let collisionScanElapsed = 0.5;
  let recoveredInitialOrbit = false;

  function refreshCollisionMeshes(): void {
    if (!terrainSafeOrbit) return;
    collisionMeshes = collectEnvironmentCameraCollisionMeshes(
      scene as unknown as Object3D
    );
  }

  function constrainAndSyncOrbit(controls: CameraControls): void {
    if (terrainSafeOrbit && collisionMeshes.length > 0) {
      keepEnvironmentReviewOrbitAboveSurface(controls, collisionMeshes);
    }
    schedulePoseSync(controls);
  }

  function schedulePoseSync(controls: CameraControls) {
    if (poseSyncTimer !== null) clearTimeout(poseSyncTimer);
    poseSyncTimer = setTimeout(() => writePoseToUrl(controls), 350);
  }

  function writePoseToUrl(controls: CameraControls) {
    poseSyncTimer = null;
    controls.getPosition(scratchPosition);
    controls.getTarget(scratchTarget);
    const url = new URL(window.location.href);
    setCameraUrlPose(url, {
      position: scratchPosition,
      target: scratchTarget,
      fov: preset.fov,
    });
    window.history.replaceState(window.history.state, "", url);
  }

  useTask((delta) => {
    if (walk || !terrainSafeOrbit || !orbitControls) return;
    collisionScanElapsed += delta;
    if (collisionMeshes.length === 0 && collisionScanElapsed >= 0.5) {
      collisionScanElapsed = 0;
      refreshCollisionMeshes();
    }
    if (collisionMeshes.length === 0) return;
    if (!recoveredInitialOrbit || orbitControls.active) {
      const corrected = keepEnvironmentReviewOrbitAboveSurface(
        orbitControls,
        collisionMeshes
      );
      recoveredInitialOrbit = true;
      if (corrected) schedulePoseSync(orbitControls);
    }
  });

  onDestroy(() => {
    if (poseSyncTimer !== null) clearTimeout(poseSyncTimer);
  });
</script>

{#if walk}
  <T.PerspectiveCamera
    makeDefault
    position={[preset.position[0], preset.position[1], preset.position[2]]}
    fov={preset.fov}
  />
  <UnifiedCameraController
    {destinationId}
    avatarState={cameraPlayer.avatarState}
    {physicsProvider}
    enabled
    initialYaw={walkPose.yaw}
    initialPitch={walkPose.pitch}
    allowedModes={[CameraMode.FIRST_PERSON]}
    disableModeToggle
    {destinationDefaults}
    moveSpeed={CAMERA_DEFAULTS.WALK_SPEED}
    sprintMultiplier={CAMERA_DEFAULTS.SPRINT_MULTIPLIER}
    jumpForce={CAMERA_DEFAULTS.JUMP_VELOCITY}
    gravity={CAMERA_DEFAULTS.GRAVITY}
  />
{:else}
  <T.PerspectiveCamera
    makeDefault
    position={[preset.position[0], preset.position[1], preset.position[2]]}
    fov={preset.fov}
  >
    <OrbitControls
      bind:ref={orbitControls}
      enableDamping
      target={[preset.target[0], preset.target[1], preset.target[2]]}
      minDistance={2}
      maxDistance={maxOrbitDistance}
      maxPolarAngle={terrainSafeOrbit ? Math.PI / 2 - 0.02 : Math.PI / 2 + 0.04}
      {collisionMeshes}
      onchange={constrainAndSyncOrbit}
    />
  </T.PerspectiveCamera>
{/if}
