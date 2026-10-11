<script lang="ts">
  import { Canvas } from "@threlte/core";
  import { AgXToneMapping, PCFSoftShadowMap } from "three";
  import GrayboxReviewShell from "#lib/features/museum/components/graybox/GrayboxReviewShell.svelte";
  import { VULCAN_CAVE_WINGS } from "#lib/features/museum/data/wing-declarations/vulcan-cave-wings.js";
  import DrownedGalleryWalkScene from "./DrownedGalleryWalkScene.svelte";

  const declaration = VULCAN_CAVE_WINGS.find(
    (wing) => wing.wingId === "split-same"
  );
  if (!declaration) throw new Error("split-same wing declaration is missing");

  let assetReady = $state(false);
  let resetToken = $state(0);
  let position = $state({ x: 0.25, y: 0.95, z: 33 });
</script>

<svelte:head>
  <title>Walk the Drowned Gallery graybox</title>
  <meta
    name="description"
    content="First-person spatial review of the Drowned Gallery Blender graybox."
  />
</svelte:head>

<GrayboxReviewShell
  {declaration}
  title="The Drowned Gallery"
  {position}
  {assetReady}
  onReset={() => (resetToken += 1)}
>
  <Canvas dpr={1} shadows={PCFSoftShadowMap} toneMapping={AgXToneMapping}>
    <DrownedGalleryWalkScene
      {resetToken}
      onAssetReady={() => (assetReady = true)}
      onPositionChange={(nextPosition) => (position = nextPosition)}
    />
  </Canvas>
</GrayboxReviewShell>
