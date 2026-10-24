<!--
  VillageSeatedFigure - An elder sitting by the fire.

  In one of the camp chairs: thighs on the seat, feet on the ground, hands on
  the thighs, facing the fire (shared/3d/performers/chair-seat.ts, the Flow
  Fest jam's chair fit). With every chair taken the sim sits them where they
  are, so with no chair under them they sit on the ground in the clip's own
  pose. Says when it is ready, so the standing rig only fades out once there
  is someone to fade to.
-->
<script lang="ts">
  import { T, useTask } from "@threlte/core";
  import { onDestroy, onMount } from "svelte";
  import type { Material, Mesh, Object3D } from "three";
  import {
    createChairSitter,
    type ChairSitter,
  } from "#lib/shared/3d/performers/chair-sitter.js";
  import { seatedPlacement } from "#lib/shared/3d/performers/chair-seat.js";

  interface Props {
    modelUrl: string;
    clipUrl: string;
    // Where they sit and the way they face (atan2(dz, dx)), and whether a
    // chair stands there.
    seat: { x: number; z: number; facing: number; chair: boolean };
    // The ground the chairs stand on.
    floorY: number;
    // The chair's seat top above that ground.
    seatTop: number;
    scale?: number;
    // Seconds into the clip, so elders side by side do not move in step.
    timeOffset?: number;
    opacity: number;
    onReady?: () => void;
  }

  const {
    modelUrl,
    clipUrl,
    seat,
    floorY,
    seatTop,
    scale = 1,
    timeOffset = 0,
    opacity,
    onReady,
  }: Props = $props();

  let sitter = $state.raw<ChairSitter | null>(null);
  // Own copies of the materials, so one elder's fade does not fade every
  // other clone of the character, with each one's own opacity kept: hair
  // and eyelash cards are authored see-through.
  let materials: {
    material: Material;
    opacity: number;
    transparent: boolean;
  }[] = [];

  function takeOwnMaterials(root: Object3D): void {
    root.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      const own = (material: Material) => {
        const copy = material.clone();
        materials.push({
          material: copy,
          opacity: copy.opacity,
          transparent: copy.transparent,
        });
        return copy;
      };
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(own)
        : own(mesh.material);
    });
  }

  onMount(() => {
    let cancelled = false;
    // The seat top is in world metres; the fit works in the body's own units.
    createChairSitter(modelUrl, clipUrl, seatTop / scale, timeOffset)
      .then((made) => {
        if (cancelled) {
          made.dispose();
          return;
        }
        takeOwnMaterials(made.root);
        sitter = made;
        onReady?.();
      })
      .catch((error) => {
        console.warn("[VillageSeatedFigure] could not seat", modelUrl, error);
      });
    return () => {
      cancelled = true;
    };
  });

  const onChair = $derived(seat.chair && (sitter?.canChair ?? false));
  const placement = $derived(
    sitter
      ? seatedPlacement(
          seat,
          floorY,
          onChair ? seatTop : null,
          onChair ? sitter.chairMeasure : sitter.groundMeasure,
          scale
        )
      : null
  );

  $effect(() => {
    if (!sitter) return;
    const fading = opacity < 1;
    for (const entry of materials) {
      const transparent = entry.transparent || fading;
      if (entry.material.transparent !== transparent) {
        entry.material.transparent = transparent;
        entry.material.needsUpdate = true;
      }
      entry.material.opacity = entry.opacity * opacity;
    }
    sitter.root.visible = opacity > 0;
  });

  useTask((delta) => {
    if (sitter && opacity > 0) sitter.update(delta, onChair);
  });

  onDestroy(() => {
    sitter?.dispose();
    for (const entry of materials) entry.material.dispose();
  });
</script>

{#if sitter && placement}
  <T.Group
    position.x={placement.x}
    position.y={placement.y}
    position.z={placement.z}
    rotation.y={placement.rotationY}
    {scale}
  >
    <T is={sitter.root} />
  </T.Group>
{/if}
