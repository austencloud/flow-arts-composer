<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { T, useTask } from "@threlte/core";
  import { Vector3 } from "three";
  import { VolumetricFireMesh } from "#lib/shared/3d/effects/fire/volumetric-fire-mesh.js";
  import { QualityTier } from "#lib/shared/3d/effects/types.js";

  interface Props {
    shrineId: string;
    position: [number, number, number];
  }

  const props: Props = $props();
  const fire = new VolumetricFireMesh({
    preset: "classic",
    qualityTier: QualityTier.MEDIUM,
    boxScale: new Vector3(1.9, 3.4, 1.9),
  });
  fire.name = `FirstFireShrineVolume_${props.shrineId}`;
  fire.position.set(props.position[0], 1.68, props.position[2]);
  fire.setIntensity(1.08);
  fire.setTurbulence(1.2);
  fire.setScrollSpeed(1.3);
  fire.setWarp(0.96);
  fire.setErosion(0.5);
  fire.setEmission(2.2);
  fire.setFlameRadius(0.7);

  let elapsed = 0;
  let motionScale = 1;
  let reducedMotionQuery: MediaQueryList | null = null;

  function syncMotionPreference(): void {
    motionScale = reducedMotionQuery?.matches ? 0.35 : 1;
  }

  onMount(() => {
    reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    syncMotionPreference();
    reducedMotionQuery.addEventListener("change", syncMotionPreference);
  });

  useTask((delta) => {
    elapsed += Math.min(delta, 1 / 20) * motionScale;
    fire.setTime(elapsed);
  });

  onDestroy(() => {
    reducedMotionQuery?.removeEventListener("change", syncMotionPreference);
    fire.dispose();
  });
</script>

<T is={fire} />
