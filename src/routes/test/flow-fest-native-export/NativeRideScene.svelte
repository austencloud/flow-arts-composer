<script lang="ts">
  import { onDestroy, tick } from "svelte";
  import { T, useScheduler, useTask, useThrelte } from "@threlte/core";
  import { Avatar3D } from "@austencloud/scene-3d";
  import type { Group, Scene, SkinnedMesh } from "three";
  import type { CharacterId } from "#lib/shared/3d/domain/character-model.js";
  import {
    resolveThrelteRenderer,
    resolveThrelteScene,
  } from "#lib/shared/3d/scene-boot/threlte-handles.js";
  import { flowFestEucPedalAnchorLocal } from "#lib/features/flow-fest-sim/domain/flow-fest-euc-mounted-pose.js";
  import { FlowFestEucMountedPoseRig } from "#lib/features/flow-fest-sim/services/flow-fest-euc-mounted-pose-rig.js";
  import { refreshSkinnedSkeletons } from "#lib/features/flow-fest-sim/services/flow-fest-avatar-skeleton-refresh.js";
  import { captureMountedFrame } from "./native-capture.js";

  interface Props {
    character: CharacterId;
    onReady: () => void;
  }
  const props: Props = $props();
  const id = "native-ride";
  const leftPedal = flowFestEucPedalAnchorLocal("left");
  const rightPedal = flowFestEucPedalAnchorLocal("right");
  const { renderer: rendererValue, scene: sceneValue } = useThrelte();
  const renderer = resolveThrelteRenderer(rendererValue);
  const scene = resolveThrelteScene(sceneValue) as Scene;
  const { scheduler, resetFrameInvalidation } = useScheduler();
  const poseRig = new FlowFestEucMountedPoseRig();
  let vehicle: Group | undefined = $state();
  let rider: Group | undefined = $state();
  let left: Group | undefined = $state();
  let right: Group | undefined = $state();
  let reported = false;
  let attached = false;

  useTask(() => {
    const performer = scene.getObjectByName(`PERFORMER_${id}`);
    let hasBones = false;
    performer?.traverse((object) => {
      const mesh = object as SkinnedMesh;
      if (mesh.isSkinnedMesh && mesh.skeleton.bones.length > 0) hasBones = true;
    });
    if (!reported && hasBones) {
      reported = true;
      props.onReady();
    }
  });

  export function pauseAutoLoop(): void {
    renderer.setAnimationLoop(null);
  }

  export async function sampleFrame(frame: number) {
    const performer = scene.getObjectByName(`PERFORMER_${id}`);
    if (!performer || !vehicle || !rider || !left || !right)
      throw new Error(`Mounted scene for ${props.character} is incomplete`);
    poseRig.setAnchors({
      vehicleRoot: vehicle,
      riderFrame: rider,
      left,
      right,
    });
    if (!attached) {
      if (!poseRig.attach(performer))
        throw new Error(
          `Mounted rig ${props.character}: ${poseRig.diagnostic().unsupportedReason}`
        );
      attached = true;
    }
    const ms = frame * (1000 / 30);
    await tick();
    scheduler.run(ms);
    resetFrameInvalidation();
    poseRig.update({
      deltaSeconds: 1 / 30,
      drive: {
        longitudinalAccelerationMetersPerSecondSquared: 0,
        leanRadians: 0,
      },
      locomotionSuspended: true,
      elapsedSeconds: frame / 30,
      idle: true,
    });
    refreshSkinnedSkeletons(performer);
    const diagnostic = poseRig.diagnostic();
    if (diagnostic.status !== "ready")
      throw new Error(
        `Mounted rig ${props.character}: ${diagnostic.unsupportedReason ?? diagnostic.status}`
      );
    return { ...captureMountedFrame(scene, id, frame), diagnostic };
  }

  onDestroy(() => poseRig.detach());
</script>

<T.Group bind:ref={vehicle} name="FFS_ElectricUnicycle">
  <T.Group bind:ref={rider} name="FFS_EUC_RiderLean">
    <T.Group
      bind:ref={left}
      name="FFS_EUC_LeftPedalCapture"
      position={[leftPedal.x, leftPedal.y, leftPedal.z]}
    />
    <T.Group
      bind:ref={right}
      name="FFS_EUC_RightPedalCapture"
      position={[rightPedal.x, rightPedal.y, rightPedal.z]}
    />
    <Avatar3D
      {id}
      avatarId={props.character}
      leftPropState={null}
      rightPropState={null}
      visible={true}
      isActive={false}
      position={{ x: 0, y: 0, z: 0 }}
      facingAngle={0}
      isMoving={false}
      moveSpeed={0}
      moveDirection={{ x: 0, z: 1 }}
      enableLocomotion={true}
      enableRootMotion={false}
      isGrounded={true}
      spinePitchOffset={0}
    />
  </T.Group>
</T.Group>
