<script lang="ts">
  import { T } from "@threlte/core";
  import {
    Prop3D,
    type PropState3D,
    type PropType,
  } from "@austencloud/scene-3d";
  import { onDestroy } from "svelte";
  import type { Group } from "three";
  import type { GhostPoseSample } from "#lib/shared/effects/renderers/ghost-pose-history.js";
  import type { GhostPropPose3D } from "./ghost-prop-pose-3d";
  import {
    GhostSourceMaterials,
    resolveGhostAgeVisual,
    resolveGhostPoseFrostSeed,
    updateChronoFrostMaterial,
  } from "./ghost-chrono-frost-3d";

  interface Props {
    sample: GhostPoseSample<GhostPropPose3D> | null;
    fallbackState: PropState3D;
    propType: PropType;
    propHand: "left" | "right";
    intensity: number;
    lifetimeSeconds: number;
    rimPower: number;
    propLength: number;
    geometryScale?: number;
    slotIndex: number;
  }

  let {
    sample,
    fallbackState,
    propType,
    propHand,
    intensity,
    lifetimeSeconds,
    rimPower,
    propLength,
    geometryScale = 1,
    slotIndex,
  }: Props = $props();

  let groupRef = $state<Group>();
  // Each mesh gets a frost material cut from its own material, so the ghost
  // keeps the prop's texture and colors (bark and tape, a staff's hand color).
  const sourceMaterials = new GhostSourceMaterials(slotIndex);
  const active = $derived(sample !== null);
  const pose = $derived(sample?.snapshot ?? null);
  const renderedState = $derived(pose?.propState ?? fallbackState);
  const position = $derived(pose?.center ?? ([0, 0, 0] as const));
  const normalizedAge = $derived(
    Math.max(
      0,
      Math.min(1, (sample?.ageSeconds ?? lifetimeSeconds) / lifetimeSeconds)
    )
  );
  // Old translucent poses draw first; fresh icy bodies draw last. The order is
  // tied to time, so reassigning a reusable slot cannot make layers pop.
  const renderOrder = $derived(
    500 + (1 - normalizedAge) * 1000 + slotIndex * 0.0001
  );
  const frostSeed = $derived(
    sample
      ? resolveGhostPoseFrostSeed(sample.key)
      : resolveGhostPoseFrostSeed(`empty-${slotIndex}`)
  );

  $effect(() => {
    const root = groupRef;
    if (!root) return;
    void propType;
    const ageSeconds = sample?.ageSeconds ?? lifetimeSeconds;
    const visual = resolveGhostAgeVisual(
      ageSeconds,
      lifetimeSeconds,
      intensity
    );
    // GLTF props finish loading (and re-clone on a hand color change) after
    // mount, so re-skin on every update rather than once.
    for (const material of sourceMaterials.apply(root)) {
      updateChronoFrostMaterial(material, visual, rimPower, frostSeed);
    }
  });

  onDestroy(() => sourceMaterials.dispose());
</script>

<T.Group
  bind:ref={groupRef}
  {position}
  {renderOrder}
  visible={active}
  userData={{ ghostChronoFrostSlot: slotIndex }}
>
  <Prop3D
    {propType}
    propState={renderedState}
    color={propHand === "left" ? "blue" : "red"}
    visible={true}
    length={propLength}
    {geometryScale}
  />
</T.Group>
