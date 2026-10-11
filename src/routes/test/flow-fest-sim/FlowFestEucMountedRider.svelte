<script lang="ts">
  /**
   * The rider standing on the electric unicycle.
   *
   * `Avatar3D` still owns the model, its materials, its idle animation, and
   * its arms. What this component adds is the contact pose: after the avatar's
   * own frame task has run and before the frame renders, the pelvis is placed
   * over the support line and each leg is solved onto its own pedal anchor.
   *
   * The stage ordering is the whole trick. `Avatar3D` animates in `mainStage`,
   * so a stage declared `after: mainStage, before: renderStage` is the last
   * writer of these bones every frame - including the first frame the model
   * exists, which is why mounting never shows a walk cycle.
   */
  import { T, useStage, useTask, useThrelte, type Stage } from "@threlte/core";
  import { Avatar3D } from "@austencloud/scene-3d";
  import { onDestroy } from "svelte";
  import type { Object3D, SkinnedMesh } from "three";
  import {
    FLOW_FEST_EUC_CONFIG,
    type FlowFestElectricUnicycleDynamics,
  } from "#lib/features/flow-fest-sim/domain/flow-fest-electric-unicycle.js";
  import type { FlowFestEucMountedPoseDiagnostic } from "#lib/features/flow-fest-sim/domain/flow-fest-euc-mounted-pose.js";
  import { FlowFestEucMountedPoseRig } from "#lib/features/flow-fest-sim/services/flow-fest-euc-mounted-pose-rig.js";
  import { repairFadeLeftoverMaterials } from "#lib/features/flow-fest-sim/services/flow-fest-avatar-material-repair.js";
  import { refreshSkinnedSkeletons } from "#lib/features/flow-fest-sim/services/flow-fest-avatar-skeleton-refresh.js";

  interface Props {
    dynamics: FlowFestElectricUnicycleDynamics;
    /** Longitudinal acceleration from the last simulation step, m/s². */
    longitudinalAccelerationMetersPerSecondSquared?: number;
    /** `FFS_ElectricUnicycle`: heading and terrain attitude. */
    vehicleRoot: Object3D | undefined;
    /** `FFS_EUC_RiderLean`: suspension, visual pitch, visual lean. */
    riderFrame: Object3D | undefined;
    leftPedalAnchor: Object3D | undefined;
    rightPedalAnchor: Object3D | undefined;
    onDiagnostic?: (diagnostic: FlowFestEucMountedPoseDiagnostic) => void;
  }

  const props: Props = $props();

  const PERFORMER_ID = "flow-fest-player";
  const PERFORMER_NODE_NAME = `PERFORMER_${PERFORMER_ID}`;

  const { mainStage, renderStage } = useThrelte() as unknown as {
    mainStage: Stage;
    renderStage: Stage;
  };
  const mountedPoseStage = useStage(Symbol("flow-fest-euc-mounted-pose"), {
    after: mainStage,
    before: renderStage,
  });

  const rig = new FlowFestEucMountedPoseRig();
  let elapsedSeconds = 0;
  const MATERIAL_REPAIR_INTERVAL_SECONDS = 1;
  // Starts at the interval so the first frame the model exists is repaired.
  let repairAccumulator = MATERIAL_REPAIR_INTERVAL_SECONDS;

  /**
   * `Avatar3D` publishes no handle to its skeleton, so the performer group is
   * found by the name it gives its own root. It appears the frame the GLTF
   * finishes loading; until then there is nothing to pose.
   */
  function findPerformerRoot(from: Object3D): Object3D | null {
    let found: Object3D | null = null;
    from.traverse((node) => {
      if (found) return;
      if (node.name === PERFORMER_NODE_NAME) found = node;
    });
    return found;
  }

  useTask(
    (delta) => {
      const { vehicleRoot, riderFrame, leftPedalAnchor, rightPedalAnchor } =
        props;
      if (!vehicleRoot || !riderFrame || !leftPedalAnchor || !rightPedalAnchor) {
        return;
      }

      elapsedSeconds += delta;
      rig.setAnchors({
        vehicleRoot,
        riderFrame,
        left: leftPedalAnchor,
        right: rightPedalAnchor,
      });

      const performerRoot = findPerformerRoot(riderFrame);
      if (!performerRoot) {
        rig.advanceBlend(delta, {
          longitudinalAccelerationMetersPerSecondSquared:
            props.longitudinalAccelerationMetersPerSecondSquared ?? 0,
          leanRadians: props.dynamics.leanRadians,
        });
        props.onDiagnostic?.(rig.diagnostic());
        return;
      }
      if (!rig.isAttachedTo(performerRoot)) {
        rig.attach(performerRoot);
        // The pose rig moves the pelvis and legs well outside each skinned
        // mesh's bind-pose bounding sphere, and three.js culls per mesh against
        // that stale sphere — the hips vanish at grazing camera angles.
        performerRoot.traverse((node) => {
          if ((node as SkinnedMesh).isSkinnedMesh) node.frustumCulled = false;
        });
      }
      // The package's mount fade can leave the clothes in its transparent,
      // non-depth-writing render state; the sweep below runs each second
      // because the fade re-runs whenever the avatar's opacity changes.
      repairAccumulator += delta;
      if (repairAccumulator >= MATERIAL_REPAIR_INTERVAL_SECONDS) {
        repairAccumulator %= MATERIAL_REPAIR_INTERVAL_SECONDS;
        repairFadeLeftoverMaterials(performerRoot);
      }

      rig.update({
        deltaSeconds: delta,
        drive: {
          longitudinalAccelerationMetersPerSecondSquared:
            props.longitudinalAccelerationMetersPerSecondSquared ?? 0,
          leanRadians: props.dynamics.leanRadians,
        },
        locomotionSuspended: true,
        elapsedSeconds,
        idle: Math.abs(props.dynamics.speedMetersPerSecond) < 0.05,
      });
      refreshSkinnedSkeletons(performerRoot);
      props.onDiagnostic?.(rig.diagnostic());
    },
    { stage: mountedPoseStage }
  );

  onDestroy(() => {
    rig.detach();
    // Publish the terminal state. Without this the host keeps the last mounted
    // reading after a dismount, so a diagnostic surface still claims the
    // contacts are held while the rider is back on foot - exactly the
    // regression this diagnostic exists to make visible.
    props.onDiagnostic?.(rig.diagnostic());
  });
</script>

<T.Group name="FFS_EUC_MountedRider">
  <!--
    Position, facing, and spine pitch are all zero on purpose.

    Every one of them is attitude the vehicle hierarchy already applies: this
    group is a child of the rider-lean frame, which carries heading, terrain
    pitch and roll, suspension travel, and visual lean. Feeding any of it to
    the avatar again is the double-application the fidelity criteria forbid.

    `moveSpeed` is zero so the locomotion state machine can never leave IDLE.
    Locomotion stays enabled because the idle clip is what keeps the arms,
    head, and breathing alive; only the legs and pelvis are overwritten.
  -->
  <Avatar3D
    id={PERFORMER_ID}
    avatarId={FLOW_FEST_EUC_CONFIG.riderAvatarId}
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
