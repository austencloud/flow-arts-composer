<script lang="ts">
  import { T, useTask } from "@threlte/core";
  import { useDraco, useGltf, useMeshopt } from "@threlte/extras";
  import { onDestroy, untrack } from "svelte";
  import type { Group, Object3D } from "three";
  import type { FlowFestCarDynamics } from "#lib/features/flow-fest-sim/domain/flow-fest-car.js";
  import {
    FLOW_FEST_DRIVEN_CAR_POSE_TASK,
    FLOW_FEST_WORLD_STEP_TASK,
  } from "./flow-fest-frame-tasks";
  import {
    buildFlowFestCarBody,
    disposeFlowFestCarBody,
    flowFestDrivenCarPose,
    flowFestParkedCarModel,
    type FlowFestCarBody,
  } from "./flow-fest-parked-cars";

  /**
   * The player's own car: the same catalogue body the lot instances, built
   * once as a single articulated object so its wheels can steer and spin.
   *
   * The body is chosen on the loadout screen and never changes mid-session;
   * the host keys this component on the model id, so the model is read once.
   */
  interface Props {
    modelId: string;
    paintIndex: number;
    /** Body centre on the ground plane; height comes from the terrain. */
    position: { x: number; z: number };
    dynamics: FlowFestCarDynamics;
    sampleGroundY: (x: number, z: number) => number;
    visible?: boolean;
    onReady?: (details: { wheels: number }) => void;
    onError?: (message: string) => void;
  }

  const props: Props = $props();
  const model = flowFestParkedCarModel(untrack(() => props.modelId));
  const loaderOptions = {
    dracoLoader: useDraco("/draco/"),
    meshoptDecoder: useMeshopt(),
  };

  interface CarAssetSource {
    subscribe: (run: (value: unknown) => void) => () => void;
    error: {
      subscribe: (run: (value: Error | undefined) => void) => () => void;
    };
  }

  const source = useGltf(model.url, loaderOptions) as unknown as CarAssetSource;
  let body = $state<FlowFestCarBody | null>(null);

  $effect(() => {
    const unsubscribers = [
      source.subscribe((value) => {
        const scene = (value as { scene?: Object3D } | undefined)?.scene;
        if (!scene || untrack(() => body)) return;
        const built = buildFlowFestCarBody(
          scene,
          model,
          untrack(() => props.paintIndex)
        );
        body = built;
        props.onReady?.({ wheels: built.wheels.length });
      }),
      source.error.subscribe((error) => {
        if (!error) return;
        console.error(
          `[flow-fest-sim] Driven-car asset failed to load: ${model.id} (${model.url})`,
          error
        );
        props.onError?.(error.message || String(error));
      }),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  });

  onDestroy(() => {
    if (body) disposeFlowFestCarBody(body);
  });

  /**
   * The body's transform is written here, inside the frame, never through
   * `position`/`rotation` props on the group. Threlte applies plain props in
   * a Svelte effect, and Svelte flushes effects on a microtask that cannot
   * run until the whole animation frame, render stage included, is over. A
   * prop-driven body therefore painted one physics step behind the chase
   * camera, which writes its own transform imperatively inside its task from
   * the body position read that same frame. At driving speed that one step
   * is a third of a metre, and projected through a camera that had already
   * moved on it read as the car teleporting back and forth. Ordering this
   * task after the scene's world step means the pose read here is the one
   * physics just produced, and it reaches the screen in the same frame.
   */
  let bodyGroup = $state<Group>();
  useTask(
    FLOW_FEST_DRIVEN_CAR_POSE_TASK,
    () => {
      const group = bodyGroup;
      if (!group) return;
      const pose = flowFestDrivenCarPose(
        model,
        props.position,
        props.dynamics,
        props.sampleGroundY
      );
      group.position.set(pose.x, pose.y, pose.z);
      // YZX reproduces the parked placement matrix (yaw, then pitch about the
      // body's Z, then roll about its X); tests/unit/flow-fest-parked-cars.test.ts
      // pins the order against flowFestParkedCarPlacementMatrix.
      group.rotation.set(pose.roll, pose.yaw, pose.pitch, "YZX");
    },
    { after: FLOW_FEST_WORLD_STEP_TASK }
  );
</script>

{#if body}
  <T.Group
    name={`FFS_DrivenCar_${model.id}`}
    bind:ref={bodyGroup}
    visible={props.visible ?? true}
  >
    <T is={body.root} />
    {#each body.wheels as wheel (wheel.corner)}
      <!--
        Front wheels yaw with the steering; every wheel spins on its axle.
        These stay as props: a wheel's spin and steer are local and
        continuous, so landing one flush late is a phase offset nobody sees.
      -->
      <T.Group
        name={`FFS_DrivenCar_Wheel_${wheel.corner}`}
        position={[wheel.center.x, wheel.center.y, wheel.center.z]}
        rotation={[
          0,
          wheel.steers ? props.dynamics.steeringRadians : 0,
          -props.dynamics.wheelTravelMeters / wheel.radiusMeters,
          "XYZ",
        ]}
      >
        {#each wheel.parts as part, index (index)}
          <T.Mesh
            geometry={part.geometry}
            material={part.material}
            castShadow
            receiveShadow
          />
        {/each}
      </T.Group>
    {/each}
  </T.Group>
{/if}
