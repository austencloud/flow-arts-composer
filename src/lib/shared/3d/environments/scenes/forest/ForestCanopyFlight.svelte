<script lang="ts">
  import { T, useTask, useThrelte } from "@threlte/core";
  import { onDestroy, untrack } from "svelte";
  import {
    DoubleSide,
    Group,
    Mesh,
    MeshBasicMaterial,
    Shape,
    ShapeGeometry,
  } from "three";
  import {
    prefersReducedMotion,
    resolveMotionScale,
  } from "../../primitives/motion-preference";

  interface Props {
    groundY: number;
  }

  interface BatFlight {
    group: Group;
    mesh: Mesh;
    centerX: number;
    height: number;
    depth: number;
    span: number;
    duration: number;
    phase: number;
    wingSpeed: number;
  }

  let { groundY }: Props = $props();

  const { camera } = useThrelte();

  const batShape = new Shape();
  batShape.moveTo(0, 0.2);
  batShape.lineTo(0.07, 0.12);
  batShape.lineTo(0.14, 0.08);
  batShape.lineTo(0.34, 0.2);
  batShape.lineTo(0.66, 0.05);
  batShape.lineTo(0.48, -0.02);
  batShape.lineTo(0.57, -0.16);
  batShape.lineTo(0.31, -0.09);
  batShape.lineTo(0.11, -0.24);
  batShape.lineTo(0, -0.13);
  batShape.lineTo(-0.11, -0.24);
  batShape.lineTo(-0.31, -0.09);
  batShape.lineTo(-0.57, -0.16);
  batShape.lineTo(-0.48, -0.02);
  batShape.lineTo(-0.66, 0.05);
  batShape.lineTo(-0.34, 0.2);
  batShape.lineTo(-0.14, 0.08);
  batShape.lineTo(-0.07, 0.12);
  batShape.closePath();

  const sharedGeometry = new ShapeGeometry(batShape, 1);
  const sharedMaterial = new MeshBasicMaterial({
    color: "#354158",
    transparent: true,
    opacity: 0.76,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false,
  });

  const flights: BatFlight[] = untrack(() =>
    (
      [
        [-5, 15.5, -25, 54, 26, 0.08, 5.2],
        [14, 19, -42, 62, 31, 0.46, 4.6],
        [-18, 12.5, -53, 48, 23, 0.71, 5.8],
        [25, 22, -68, 70, 36, 0.29, 4.2],
      ] satisfies Array<
        [number, number, number, number, number, number, number]
      >
    ).map(
      ([centerX, height, depth, span, duration, phase, wingSpeed], index) => {
        const group = new Group();
        const mesh = new Mesh(sharedGeometry, sharedMaterial);
        const scale = 0.48 + index * 0.07;
        mesh.scale.set(scale, scale, scale);
        group.add(mesh);
        return {
          group,
          mesh,
          centerX,
          height,
          depth,
          span,
          duration,
          phase,
          wingSpeed,
        };
      }
    )
  );

  let elapsed = 0;
  const reducedMotion = $derived(prefersReducedMotion());
  const motionScale = $derived(resolveMotionScale(reducedMotion));

  useTask((delta) => {
    elapsed += delta * motionScale;
    const activeCamera = camera.current;
    for (const flight of flights) {
      const progress = (elapsed / flight.duration + flight.phase) % 1;
      const arc = progress * Math.PI * 2;
      flight.group.position.set(
        flight.centerX + (progress - 0.5) * flight.span,
        groundY + flight.height + Math.sin(arc * 1.7) * 1.25,
        flight.depth + Math.sin(arc) * 4.5
      );
      if (activeCamera) flight.group.lookAt(activeCamera.position);
      flight.mesh.scale.y =
        flight.mesh.scale.x *
        (0.62 + 0.38 * Math.abs(Math.sin(elapsed * flight.wingSpeed + arc)));
    }
  });

  onDestroy(() => {
    sharedGeometry.dispose();
    sharedMaterial.dispose();
  });
</script>

{#each flights as flight (flight)}
  <T is={flight.group} />
{/each}
