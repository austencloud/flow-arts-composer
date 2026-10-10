<script lang="ts">
  import { T } from "@threlte/core";
  import { userProportionsState } from "@austencloud/scene-3d";
  import {
    Character3D,
    DEFAULT_CHARACTER_ID,
  } from "#lib/shared/3d/domain/character-model.js";
  import { cubicInOut } from "svelte/easing";
  import { Tween } from "svelte/motion";

  import { motionDuration } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";

  interface Props {
    index: number;
    color: string;
    visible: boolean;
    x?: number;
    z?: number;
    facingAngle?: number;
  }

  let {
    index,
    color,
    visible,
    x = 0,
    z = 0,
    facingAngle = 0,
  }: Props = $props();

  const transitionOptions = {
    duration: motionDuration(DURATION.emphasis),
    easing: cubicInOut,
  };
  const positionX = new Tween(x, transitionOptions);
  const positionZ = new Tween(z, transitionOptions);
  const yaw = new Tween(facingAngle, transitionOptions);
  const opacity = new Tween(0, transitionOptions);

  $effect(() => {
    if (x !== undefined) void positionX.set(x, transitionOptions);
    if (z !== undefined) void positionZ.set(z, transitionOptions);
    void yaw.set(facingAngle ?? 0, transitionOptions);
    void opacity.set(visible ? 1 : 0, transitionOptions);
  });

  const groundOffset = $derived(-userProportionsState.groundY);
</script>

<T.Group
  position.x={positionX.current}
  position.y={groundOffset}
  position.z={positionZ.current}
  rotation.y={yaw.current}
  visible={opacity.current > 0.01}
>
  <Character3D
    id="studio-starter-performer-{index}"
    avatarId={DEFAULT_CHARACTER_ID}
    leftPropState={null}
    rightPropState={null}
    isActive={false}
    enableLocomotion
    enableFootPlanting
    opacity={opacity.current}
  />

  <T.Mesh rotation.x={-Math.PI / 2} position.y={-groundOffset + 0.008}>
    <T.CircleGeometry args={[0.3, 32]} />
    <T.MeshStandardMaterial
      {color}
      transparent
      opacity={opacity.current * 0.72}
      emissive={color}
      emissiveIntensity={0.32}
    />
  </T.Mesh>
</T.Group>
