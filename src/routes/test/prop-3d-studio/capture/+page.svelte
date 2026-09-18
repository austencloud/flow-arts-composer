<!--
  Build-preview capture harness for the Prop Studio picker tiles.

  Load with query params and screenshot the 1280x480 canvas at the top-left
  of the page, then downscale to 640x240 webp:

    /test/prop-3d-studio/capture?prop=fan&fanBuild=lotus&rz=-90&zoom=1.15

  - prop:   scene-3d PropType value (staff, triad, quiad, trigeng, ...)
  - finish: fire | day (props with finish variants)
  - fanBuild: pictograph | fire | lotus | day | moon
  - fanFrameColor: black | white
  - fanCover: bare | covered
  - triangleGrip: corner | side
  - rx/ry/rz: presentation rotation in degrees
  - zoom:   camera distance multiplier (default 1)
  - effect: led mounts the production LED orchestrator and live diffuser
  - ledPattern: rainbow previews full 78-emitter addressable color routing

  document.body.dataset.captureReady flips to "1" once the model has loaded
  and the framing is stable.
-->
<script lang="ts">
  import { Canvas } from "@threlte/core";
  import { page } from "$app/state";
  import {
    PropType,
    propFinishState,
    type FanBuild,
    type FanCover,
    type FanFrameColor,
    type PropFinish,
    type TriangleGrip,
  } from "@austencloud/scene-3d";
  import CaptureScene from "./CaptureScene.svelte";

  const params = $derived(page.url.searchParams);

  const SCENE_PROP_TYPES = new Set<string>(Object.values(PropType));

  const propType = $derived.by(() => {
    const requested = params.get("prop") ?? PropType.STAFF;
    return SCENE_PROP_TYPES.has(requested)
      ? (requested as PropType)
      : PropType.STAFF;
  });

  const rotationDeg = $derived({
    x: Number(params.get("rx") ?? 0),
    y: Number(params.get("ry") ?? 0),
    z: Number(params.get("rz") ?? 0),
  });

  const zoom = $derived(Number(params.get("zoom") ?? 1) || 1);
  const ledActive = $derived(params.get("effect") === "led");
  const ledPattern = $derived(
    params.get("ledPattern") === "rainbow" ? "rainbow-sweep" : "prop-colors"
  );
  const captureKey = $derived(
    [
      propType,
      params.get("finish") ?? "",
      params.get("fanBuild") ?? "",
      params.get("fanFrameColor") ?? "",
      params.get("fanCover") ?? "",
      params.get("triangleGrip") ?? "",
      params.get("effect") ?? "",
      params.get("ledPattern") ?? "",
    ].join(":")
  );

  $effect(() => {
    const finish = params.get("finish");
    if (finish === "fire" || finish === "day") {
      propFinishState.set(finish satisfies PropFinish);
    }
    const fanBuild = params.get("fanBuild");
    if (
      fanBuild === "pictograph" ||
      fanBuild === "fire" ||
      fanBuild === "lotus" ||
      fanBuild === "day" ||
      fanBuild === "moon"
    ) {
      propFinishState.setFanBuild(fanBuild satisfies FanBuild);
    }
    const fanFrameColor = params.get("fanFrameColor");
    if (fanFrameColor === "black" || fanFrameColor === "white") {
      propFinishState.setFanFrameColor(fanFrameColor satisfies FanFrameColor);
    }
    const fanCover = params.get("fanCover");
    if (fanCover === "bare" || fanCover === "covered") {
      propFinishState.setFanCover(fanCover satisfies FanCover);
    }
    const triangleGrip = params.get("triangleGrip");
    if (triangleGrip === "corner" || triangleGrip === "side") {
      propFinishState.setTriangleGrip(triangleGrip satisfies TriangleGrip);
    }
  });
</script>

<svelte:head>
  <title>Prop build-preview capture</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="capture-stage">
  {#key captureKey}
    <Canvas>
      <CaptureScene {propType} {rotationDeg} {zoom} {ledActive} {ledPattern} />
    </Canvas>
  {/key}
</div>

<style>
  .capture-stage {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: #070911;
  }

  .capture-stage :global(canvas) {
    display: block;
    width: 100% !important;
    height: 100% !important;
  }
</style>
