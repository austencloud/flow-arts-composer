<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { SceneEnvironmentId } from "#lib/shared/3d/environments/domain/scene-environment.js";
  import Viewer3DCanvas from "#lib/shared/3d/components/Viewer3DCanvas.svelte";
  import { createViewer3DState } from "#lib/shared/3d/state/viewer-3d-state.svelte.js";
  import { setViewer3DContext } from "#lib/shared/3d/context/viewer-3d-context.js";
  import demo from "#lib/shared/landing/data/demo-sequence.json";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

  let { worker = false } = $props<{ worker?: boolean }>();
  const sequence = demo as unknown as SequenceData;
  const viewer = createViewer3DState({
    renderMode: "3d",
    environmentId: SceneEnvironmentId.RAINBOW,
    sceneFeatures: {
      environment: true,
      stage: true,
      audience: false,
    },
  });
  setViewer3DContext(viewer);
  let mounted = $state(false);
  let ready = $state(false);
  let width = $state(1440);
  let height = $state(900);
  let performance = $state("");
  let settled = $state(false);
  const count = $derived(viewer.performerManager.performers.length);
  function frame() {
    const portrait = width / height < 0.8;
    const distance = count > 4 ? 32 : 20;
    viewer.snapCameraTo(
      { x: 0, y: portrait ? 6 : 3.8, z: portrait ? distance * 1.8 : distance },
      { x: 0, y: 1.8, z: -1 },
      undefined,
      false
    );
  }
  function setCount(target: number) {
    while (viewer.performerManager.performers.length < target)
      viewer.spawnPerformerFromUI();
    while (viewer.performerManager.performers.length > target)
      viewer.removePerformerFromUI();
    frame();
  }
  onMount(() => {
    viewer.enter3D(sequence);
    mounted = true;
  });
  onDestroy(() => viewer.dispose());
  $effect(() => {
    void width;
    void height;
    if (ready) frame();
  });
</script>

<svelte:window bind:innerWidth={width} bind:innerHeight={height} />
<section
  aria-label="Spectrum Commons production viewer"
  data-ready={ready}
  data-performers={count}
  data-performance={performance}
  data-environment={viewer.environmentId}
  data-settled={settled}
>
  {#if mounted}
    <Viewer3DCanvas
      sequenceData={sequence}
      currentStep={0}
      isPlaying={false}
      leftPropType="staff"
      rightPropType="staff"
      hideOverlays
      hideSceneMarkers
      enablePerformerLocomotion={false}
      rendererHandleRequired={!worker}
      onSceneReadyChange={(value) => {
        ready = value;
        if (value) frame();
      }}
      onPerformanceSample={worker
        ? undefined
        : (value) => (performance = JSON.stringify(value))}
      onEnvironmentTransitionChange={(value) => (settled = value.settled)}
    />
  {/if}
  <select
    aria-label="Review environment"
    value={viewer.environmentId}
    onchange={(event) =>
      viewer.setEnvironmentId(event.currentTarget.value as SceneEnvironmentId)}
  >
    <option value={SceneEnvironmentId.RAINBOW}>Rainbow</option>
    <option value={SceneEnvironmentId.VOID}>Void</option>
  </select>
  <nav aria-label="Review cast">
    {#each [1, 4, 8] as amount}<button
        type="button"
        aria-pressed={count === amount}
        onclick={() => setCount(amount)}>{amount} performers</button
      >{/each}
  </nav>
</section>

<style>
  section {
    position: absolute;
    inset: 0;
  }
  nav {
    position: absolute;
    bottom: 16px;
    left: 8px;
    right: 8px;
    display: flex;
    justify-content: center;
    gap: 8px;
  }
  button {
    min-height: 44px;
    padding: 8px 12px;
    border: 1px solid #ffffff70;
    border-radius: 8px;
    background: #07111fe8;
    color: white;
  }
  button[aria-pressed="true"] {
    background: #29445d;
  }
  button:focus-visible {
    outline: 3px solid #fbd38d;
    outline-offset: 3px;
  }
  select {
    position: absolute;
    top: 16px;
    right: 16px;
    min-height: 44px;
    padding: 8px;
    color: white;
    background: #07111fe8;
    border: 1px solid #ffffff70;
    border-radius: 8px;
  }
  select:focus-visible {
    outline: 3px solid #fbd38d;
    outline-offset: 3px;
  }
</style>
