<script lang="ts">
  import { T, useTask } from "@threlte/core";
  import { CameraMode, UnifiedCameraController } from "@austencloud/camera-3d";
  import type { AvatarState, PhysicsProvider } from "@austencloud/camera-3d";
  import { Mesh, type Object3D } from "three";
  import MuseumPerformerStation3D from "#lib/features/museum/components/game/MuseumPerformerStation3D.svelte";
  import GltfAsset from "#lib/shared/3d/environments/primitives/GltfAsset.svelte";
  import { buildEarthRootObservatoryBlenderContract } from "#lib/features/museum/data/earth-root-observatory-blender-contract.js";
  import {
    buildEarthRootObservatoryPlanForGrid,
    type EarthRootObservatoryPlan,
    type EarthRootObservatoryStop,
  } from "#lib/features/museum/data/earth-root-observatory-plan.js";
  import { createEarthRootObservatoryGrayboxReviewGrid } from "#lib/features/museum/data/earth-root-observatory-graybox-terrain.js";
  import { buildVulcanCaveFloorPlan } from "#lib/features/museum/data/vulcan-cave-floor-plan.js";
  import { createMuseumPhysicsProvider } from "#lib/features/museum/services/museum-physics-provider.js";

  interface Props {
    selectedStopId: string;
    teleportToken: number;
    onAssetReady?: () => void;
    onPositionChange?: (position: { x: number; y: number; z: number }) => void;
  }

  const props: Props = $props();
  const contract = buildEarthRootObservatoryBlenderContract();
  const cave = buildVulcanCaveFloorPlan();

  function requirePlan(): EarthRootObservatoryPlan {
    const result = buildEarthRootObservatoryPlanForGrid(cave.grid);
    if (!result) throw new Error("Earth Root Observatory plan is unavailable");
    return result;
  }

  const plan = requirePlan();

  const reviewGrid = createEarthRootObservatoryGrayboxReviewGrid(
    cave.grid,
    plan
  );
  const firstStop = plan.stops[0]!;
  const physicsProvider: PhysicsProvider = createMuseumPhysicsProvider(
    reviewGrid,
    reviewGrid.tileScale,
    { x: firstStop.x, y: firstStop.elevation, z: firstStop.z }
  );

  let appliedTeleportToken = -1;
  let playerPosition = $state(physicsProvider.getPlayerPosition());
  let playerYaw = $state(0);
  let targetPlayerYaw = $state(0);
  let isMoving = $state(false);
  let moveDirection = $state({ x: 0, z: 0 });

  function yawToward(
    from: { x: number; z: number },
    to: { x: number; z: number }
  ): number {
    return Math.atan2(to.x - from.x, to.z - from.z);
  }

  function cameraTargetFor(stop: EarthRootObservatoryStop): {
    x: number;
    y: number;
    z: number;
  } {
    if (stop.id === "fire-threshold") {
      const bend = plan.walkPath[2]!;
      return { x: bend.x, y: bend.elevation + 1.4, z: bend.z };
    }
    if (stop.id === "tree-reveal") {
      return { ...plan.tree.centre, y: 4.2 };
    }
    if (stop.id.startsWith("performer-")) {
      const performer = plan.performers.find(
        (candidate) => `performer-${candidate.id}` === stop.id
      );
      if (performer) {
        const station = contract.performers.find(
          (candidate) => candidate.id === performer.id
        );
        return {
          ...performer.centre,
          y: performer.floorElevation + (station?.stageHeight ?? 0) + 0.9,
        };
      }
    }
    if (stop.id === "recognition-overlook") {
      return { ...plan.finalCamera.target, y: -0.35 };
    }
    const exit = plan.walkPath.at(-1)!;
    return { x: exit.x, y: 1.8, z: exit.z };
  }

  const selectedStop = $derived(
    plan.stops.find((candidate) => candidate.id === props.selectedStopId) ??
      firstStop
  );
  const cameraTarget = $derived(cameraTargetFor(selectedStop));
  const cameraYaw = $derived(yawToward(selectedStop, cameraTarget));
  const cameraPitch = $derived.by(() => {
    const horizontalDistance = Math.hypot(
      cameraTarget.x - selectedStop.x,
      cameraTarget.z - selectedStop.z
    );
    const cameraY = selectedStop.elevation + plan.eyeHeight;
    return Math.atan2(cameraY - cameraTarget.y, horizontalDistance);
  });

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

  function teleportToSelectedStop(): void {
    const stop =
      plan.stops.find((candidate) => candidate.id === props.selectedStopId) ??
      firstStop;
    physicsProvider.teleport?.({ x: stop.x, y: stop.elevation, z: stop.z });
    playerPosition = physicsProvider.getPlayerPosition();
    if (avatarState.snapFacingAngle) avatarState.snapFacingAngle(cameraYaw);
    else avatarState.setFacingAngle(cameraYaw);
  }

  function handleAssetReady(scene: Object3D): void {
    scene.traverse((object) => {
      if (!(object instanceof Mesh) || !object.visible) return;
      object.castShadow = true;
      object.receiveShadow = true;
    });
    props.onAssetReady?.();
  }

  $effect(() => {
    if (props.teleportToken === appliedTeleportToken) return;
    appliedTeleportToken = props.teleportToken;
    teleportToSelectedStop();
  });

  useTask(() => {
    playerPosition = physicsProvider.getPlayerPosition();
    props.onPositionChange?.(playerPosition);
  });
</script>

<T.Color attach="background" args={["#030703"]} />
<T.FogExp2 attach="fog" args={["#071006", 0.011]} />

<T.HemisphereLight color="#b8d7a2" groundColor="#0c0804" intensity={0.54} />
<T.DirectionalLight
  position={[
    contract.room.planCentre.x - 9,
    19,
    contract.room.planCentre.z + 3,
  ]}
  color="#dceac4"
  intensity={1.15}
  castShadow={false}
/>
<T.PointLight
  position={[
    contract.room.planCentre.x + contract.tree.centre.x,
    4.8,
    contract.room.planCentre.z - contract.tree.centre.y,
  ]}
  color="#8fca59"
  intensity={74}
  distance={20}
  decay={2}
/>
{#each contract.performers as performer, index (performer.id)}
  <T.PointLight
    position={[
      contract.room.planCentre.x + performer.centre.x,
      performer.centre.z + 1.4,
      contract.room.planCentre.z - performer.centre.y,
    ]}
    color={index === 1 ? "#d9a34d" : "#7fc85b"}
    intensity={44}
    distance={10}
    decay={2}
  />
{/each}
<T.PointLight
  position={[
    (plan.southDoor.min + plan.southDoor.max) / 2,
    2.8,
    plan.room.maxZ,
  ]}
  color="#82cced"
  intensity={56}
  distance={13}
  decay={2}
/>

<GltfAsset
  url="/models/museum/cave/earth-root-observatory-graybox.glb"
  position={[contract.room.planCentre.x, 0, contract.room.planCentre.z]}
  emissiveBoost={1.12}
  onReady={handleAssetReady}
/>

{#each contract.performers as performer (performer.id)}
  <MuseumPerformerStation3D
    stationId={performer.performerId}
    worldX={contract.room.planCentre.x + performer.centre.x}
    worldY={performer.centre.z}
    worldZ={contract.room.planCentre.z - performer.centre.y}
    facingAngle={performer.facingAngle}
    sequenceId={performer.sequenceId}
    autoPlay={true}
    active={true}
    showGrid={false}
    showPlatform={false}
    standingSurfaceHeight={performer.stageHeight}
  />
{/each}

<UnifiedCameraController
  destinationId="earth-root-observatory-graybox-walk"
  {avatarState}
  {physicsProvider}
  enabled={true}
  initialYaw={cameraYaw}
  initialPitch={cameraPitch}
  allowedModes={[CameraMode.FIRST_PERSON]}
  disableModeToggle={true}
  showControlsHint={false}
  moveSpeed={contract.route.reviewSpeed}
  sprintMultiplier={1.8}
  gravity={9.81}
  jumpForce={4.5}
/>
