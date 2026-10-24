<!--
  VillageLabRun - One village in the lab: its scene and side panel, with the
  village and its story handed down by context. VillageLabTab keys this on
  the village, so coming back to a remembered village mounts a fresh one.
-->
<script lang="ts">
  import { Canvas } from "@threlte/core";
  import VillageScene from "./components/VillageScene.svelte";
  import VillageControls, {
    type VillageLabReturn,
  } from "./components/VillageControls.svelte";
  import {
    setVillageContext,
    setVillageVisualContext,
  } from "./state/village-context";
  import type { VillageState } from "./state/village-state.svelte";
  import type { VillageVisualState } from "./state/village-visual-state.svelte";

  const {
    villageState,
    visualState,
    lab,
  }: {
    villageState: VillageState;
    visualState: VillageVisualState;
    lab: VillageLabReturn;
  } = $props();

  // svelte-ignore state_referenced_locally
  setVillageContext(villageState);
  // svelte-ignore state_referenced_locally
  setVillageVisualContext(visualState);
</script>

<div class="viewport">
  <Canvas>
    <VillageScene />
  </Canvas>
</div>
<VillageControls {lab} />

<style>
  .viewport {
    flex: 1;
    position: relative;
    min-height: 0;
  }
</style>
