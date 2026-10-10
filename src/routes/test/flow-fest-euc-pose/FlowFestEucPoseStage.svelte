<script lang="ts">
  /**
   * Contact-pose evidence stage.
   *
   * Renders the production `FlowFestElectricUnicycle` - the same component the
   * sim mounts - on a ground plane inclined by a registered terrain attitude,
   * framed close enough to read a sole against a pedal.
   *
   * The terrain attitude is not hand-written. It comes from
   * `deriveFlowFestEucTerrainAttitude` fed with the height samples an inclined
   * plane would produce, so the clamps and the pitch/roll decomposition are the
   * production ones. The ground plane is then rotated by that same attitude,
   * which is what puts the wheel on the surface rather than through it.
   */
  import { T, useTask } from "@threlte/core";
  import { Color, Vector3, type PerspectiveCamera } from "three";
  import {
    createFlowFestElectricUnicycleDynamics,
    deriveFlowFestEucTerrainAttitude,
    FLOW_FEST_EUC_CONFIG,
    type FlowFestElectricUnicycleDynamics,
    type FlowFestElectricUnicycleTerrainAttitude,
  } from "#lib/features/flow-fest-sim/domain/flow-fest-electric-unicycle.js";
  import type {
    FlowFestEucContactPoints,
    FlowFestEucMountedPoseDiagnostic,
  } from "#lib/features/flow-fest-sim/domain/flow-fest-euc-mounted-pose.js";
  import FlowFestElectricUnicycle from "../flow-fest-sim/FlowFestElectricUnicycle.svelte";
  import {
    EUC_POSE_MOTIONS,
    EUC_POSE_VIEWS,
    type EucPoseMotionId,
    type EucPoseViewId,
  } from "./euc-pose-harness-views";

  interface Props {
    view: EucPoseViewId;
    slopeDegrees: number;
    /** Bearing of the uphill direction from the rider's forward axis, degrees. */
    slopeBearingDegrees: number;
    motion: EucPoseMotionId;
    mounted: boolean;
    rough: boolean;
    markers: boolean;
    /** Dynamics advance rate. `null` follows the render loop. */
    simulationRateHz: number | null;
    onDiagnostic: (diagnostic: FlowFestEucMountedPoseDiagnostic) => void;
    onDynamics: (dynamics: FlowFestElectricUnicycleDynamics) => void;
  }

  const props: Props = $props();

  const WHEEL_RADIUS_METERS = 0.363;
  const LONGITUDINAL_SPAN_METERS = 1;
  const LATERAL_SPAN_METERS = 0.6;

  const background = new Color("#12161c");

  const motion = $derived(EUC_POSE_MOTIONS[props.motion]);
  const camera = $derived(EUC_POSE_VIEWS[props.view]);

  /**
   * Height samples for a plane inclined by `slopeDegrees` about a horizontal
   * axis, with its uphill direction `slopeBearingDegrees` off the rider's
   * forward axis. A non-zero bearing is what makes a single capture exercise
   * pitch and roll together instead of one axis at a time.
   */
  const terrainAttitude: FlowFestElectricUnicycleTerrainAttitude = $derived.by(
    () => {
      const slope = Math.tan((props.slopeDegrees * Math.PI) / 180);
      const bearing = (props.slopeBearingDegrees * Math.PI) / 180;
      const longitudinal = (slope * Math.cos(bearing) * LONGITUDINAL_SPAN_METERS) / 2;
      const lateral = (slope * Math.sin(bearing) * LATERAL_SPAN_METERS) / 2;
      // A bump under the wheel registers as roughness, which is what drives
      // suspension travel. Zero on a clean plane, so idle captures do not bob.
      const centerMeters = props.rough ? 0.05 : 0;
      return deriveFlowFestEucTerrainAttitude({
        centerMeters,
        forwardMeters: longitudinal,
        rearMeters: -longitudinal,
        leftMeters: lateral,
        rightMeters: -lateral,
        longitudinalSpanMeters: LONGITUDINAL_SPAN_METERS,
        lateralSpanMeters: LATERAL_SPAN_METERS,
      });
    }
  );

  let dynamics = $state<FlowFestElectricUnicycleDynamics>(
    createFlowFestElectricUnicycleDynamics()
  );
  let accumulatedSeconds = 0;

  function advance(stepSeconds: number): void {
    const speed = motion.speedMetersPerSecond;
    dynamics = {
      ...dynamics,
      speedMetersPerSecond: speed,
      leanRadians: motion.leanRadians,
      pitchRadians: motion.pitchRadians,
      wheelRotationRadians:
        dynamics.wheelRotationRadians + (speed / WHEEL_RADIUS_METERS) * stepSeconds,
      odometerMeters: dynamics.odometerMeters + Math.abs(speed) * stepSeconds,
    };
    props.onDynamics(dynamics);
  }

  useTask((delta) => {
    const rate = props.simulationRateHz;
    if (rate === null) {
      advance(delta);
      return;
    }
    const stepSeconds = 1 / rate;
    accumulatedSeconds += delta;
    // Bounded catch-up: a stalled tab must not fast-forward the wheel.
    let steps = 0;
    while (accumulatedSeconds >= stepSeconds && steps < 8) {
      advance(stepSeconds);
      accumulatedSeconds -= stepSeconds;
      steps += 1;
    }
  });

  interface ContactMarker extends FlowFestEucContactPoints {
    side: "left" | "right";
    color: string;
  }

  let markerPoints = $state<ContactMarker[] | null>(null);

  let cameraRef = $state<PerspectiveCamera | null>(null);
  const worldTarget = new Vector3();

  /**
   * Re-aim on every view and slope change.
   *
   * A one-shot `oncreate` lookAt is not enough: switching view moves the camera
   * but leaves it pointing where the first view pointed, which frames empty
   * ground. The target is authored in the tilted group's local space, so it has
   * to be lifted into world space before `lookAt`, which takes world
   * coordinates - otherwise every sloped capture aims off the rider.
   */
  $effect(() => {
    const active = cameraRef;
    const view = camera;
    const attitude = terrainAttitude;
    if (!active) return;
    void attitude;
    active.fov = view.fovDegrees;
    active.updateProjectionMatrix();
    // Set the position here rather than trusting the prop to have landed first:
    // lookAt reads the camera's own world position, so a stale one aims wrong.
    active.position.set(view.position[0], view.position[1], view.position[2]);
    worldTarget.set(view.target[0], view.target[1], view.target[2]);
    const parent = active.parent;
    if (parent) {
      parent.updateWorldMatrix(true, false);
      parent.localToWorld(worldTarget);
    }
    active.lookAt(worldTarget);
  });

  function handleDiagnostic(
    diagnostic: FlowFestEucMountedPoseDiagnostic
  ): void {
    props.onDiagnostic(diagnostic);
    if (!props.markers) {
      if (markerPoints !== null) markerPoints = null;
      return;
    }
    markerPoints =
      diagnostic.status === "ready"
        ? [
            { side: "left", color: "#43d6ff", ...diagnostic.leftPoints },
            { side: "right", color: "#ff5f6d", ...diagnostic.rightPoints },
          ]
        : null;
  }
</script>

<T is={background} attach="background" />

<!--
  Camera and ground share the vehicle's attitude, so a slope capture reframes
  nothing: the rider stays in the same place in frame and the horizon tilts
  instead. That is what makes the level, 20-degree, and 35-degree frames
  directly comparable.
-->
<T.Group
  rotation={[terrainAttitude.pitchRadians, 0, terrainAttitude.rollRadians]}
>
  <T.PerspectiveCamera
    bind:ref={cameraRef}
    makeDefault
    position={camera.position}
    fov={camera.fovDegrees}
    near={0.05}
    far={80}
  />

  <T.Mesh rotation.x={-Math.PI / 2} receiveShadow>
    <T.CircleGeometry args={[9, 64]} />
    <T.MeshStandardMaterial color="#3c4450" roughness={0.95} metalness={0.02} />
  </T.Mesh>
  <T.Mesh position={[0, 0.001, 0]} rotation.x={-Math.PI / 2}>
    <T.RingGeometry args={[0.34, 0.42, 48]} />
    <T.MeshBasicMaterial color="#20262f" transparent opacity={0.65} />
  </T.Mesh>
</T.Group>

<T.HemisphereLight color="#dfe9ff" groundColor="#2b3038" intensity={1.55} />
<T.DirectionalLight
  position={[2.6, 4.4, 3.2]}
  intensity={2.9}
  castShadow
  shadow.mapSize.width={2048}
  shadow.mapSize.height={2048}
  shadow.camera.left={-3}
  shadow.camera.right={3}
  shadow.camera.top={3}
  shadow.camera.bottom={-3}
  shadow.camera.near={0.5}
  shadow.camera.far={14}
/>
<T.DirectionalLight position={[-3.4, 2.1, -2.8]} intensity={0.85} />

<FlowFestElectricUnicycle
  position={{ x: 0, y: 0, z: 0 }}
  {dynamics}
  {terrainAttitude}
  mounted={props.mounted}
  lightsOn={false}
  longitudinalAccelerationMetersPerSecondSquared={motion.longitudinalAccelerationMetersPerSecondSquared}
  onMountedPoseDiagnostic={handleDiagnostic}
/>

{#if props.markers && markerPoints}
  <!--
    The two ends of the measured error, in world space, drawn through the shoe:
    a ring on the pedal anchor and a dot on the sole centre. If the dot is not
    inside its ring, the contact is wrong no matter what the numbers say.

    These are the exact positions the diagnostic differenced, not a second
    guess at where the anchors are.
  -->
  {#each markerPoints as marker (marker.side)}
    <T.Mesh
      position={[
        marker.anchorWorld.x,
        marker.anchorWorld.y,
        marker.anchorWorld.z,
      ]}
      renderOrder={10}
    >
      <T.SphereGeometry args={[0.016, 18, 12]} />
      <T.MeshBasicMaterial
        color={marker.color}
        depthTest={false}
        transparent
        opacity={0.42}
      />
    </T.Mesh>
    <T.Mesh
      position={[marker.soleWorld.x, marker.soleWorld.y, marker.soleWorld.z]}
      renderOrder={11}
    >
      <T.SphereGeometry args={[0.007, 16, 12]} />
      <T.MeshBasicMaterial color={marker.color} depthTest={false} />
    </T.Mesh>
  {/each}
{/if}

<!--
  Named with the avatar id the harness is capturing, so a frame carries the rig
  it was taken on.
-->
<T.Group name={`FFS_EUC_PoseHarness_${FLOW_FEST_EUC_CONFIG.riderAvatarId}`} />
