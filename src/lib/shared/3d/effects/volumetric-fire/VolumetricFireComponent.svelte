<script lang="ts">
  /**
   * Shared static-fire bridge.
   *
   * VolumetricFireMesh owns the object-space raymarcher. This component only
   * translates scene-authored dimensions and advances its clock.
   */

  import { onDestroy } from "svelte";
  import { T, useTask } from "@threlte/core";
  import { Vector3 } from "three";
  import { VolumetricFireMesh } from "#lib/shared/3d/effects/fire/volumetric-fire-mesh.js";
  import { QualityTier } from "#lib/shared/3d/effects/types.js";

  interface Props {
    /** Center of the fire volume in world space. */
    position?: Vector3 | [number, number, number];
    /** Fire width */
    width?: number;
    /** Fire height */
    height?: number;
    /** Fire depth */
    depth?: number;
    /** Legacy quality hint retained for scene-config compatibility. */
    sliceSpacing?: number;
    /** Scale multiplier for the whole fire */
    scale?: number;
  }

  let {
    position = new Vector3(0, 0, 0),
    width = 1.0,
    height = 2.0,
    depth = 1.0,
    sliceSpacing = 0.1,
    scale = 1.0,
  }: Props = $props();

  const qualityTier =
    sliceSpacing <= 0.08
      ? QualityTier.HIGH
      : sliceSpacing <= 0.18
        ? QualityTier.MEDIUM
        : QualityTier.LOW;
  const fire = new VolumetricFireMesh({
    preset: "classic",
    qualityTier,
    boxScale: new Vector3(width * scale, height * scale, depth * scale),
  });
  fire.name = "SharedVolumetricFire";
  fire.setIntensity(1.34);
  fire.setTurbulence(1.16);
  fire.setScrollSpeed(1.34);
  fire.setWarp(0.94);
  fire.setErosion(0.39);
  fire.setEmission(3.1);
  fire.setFlameRadius(0.74);
  let elapsedTime = 0;

  $effect(() => {
    const nextPosition = Array.isArray(position)
      ? new Vector3(...position)
      : position;
    fire.position.copy(nextPosition);
    fire.scale.set(width * scale, height * scale, depth * scale);
  });

  useTask((delta) => {
    elapsedTime += Math.min(Math.max(delta, 0), 1 / 15);
    fire.setTime(elapsedTime);
  });

  onDestroy(() => fire.dispose());
</script>

<T is={fire} />
