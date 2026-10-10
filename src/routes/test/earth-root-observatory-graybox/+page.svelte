<script lang="ts">
  import { Canvas } from "@threlte/core";
  import { AgXToneMapping, PCFSoftShadowMap } from "three";
  import ActionButton from "#lib/shared/components/selection/ActionButton.svelte";
  import { buildEarthRootObservatoryPlanForGrid } from "#lib/features/museum/data/earth-root-observatory-plan.js";
  import { buildVulcanCaveFloorPlan } from "#lib/features/museum/data/vulcan-cave-floor-plan.js";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import EarthRootObservatoryWalkScene from "./EarthRootObservatoryWalkScene.svelte";

  const cave = buildVulcanCaveFloorPlan();
  const plan = buildEarthRootObservatoryPlanForGrid(cave.grid);
  if (!plan) throw new Error("Earth Root Observatory plan is unavailable");

  const stopOptions = plan.stops.map((stop) => ({
    value: stop.id,
    label: `${stop.number}. ${stop.title}`,
    shortLabel: String(stop.number),
  }));

  let assetReady = $state(false);
  let selectedStopId = $state(plan.stops[0]!.id);
  let teleportToken = $state(0);
  let position = $state({
    x: plan.stops[0]!.x,
    y: plan.stops[0]!.elevation + plan.eyeHeight,
    z: plan.stops[0]!.z,
  });

  const selectedStop = $derived(
    plan.stops.find((stop) => stop.id === selectedStopId) ?? plan.stops[0]!
  );
  const locationLabel = $derived.by(() => {
    return plan.stops.reduce((closest, candidate) => {
      const closestDistance = Math.hypot(
        position.x - closest.x,
        position.z - closest.z
      );
      const candidateDistance = Math.hypot(
        position.x - candidate.x,
        position.z - candidate.z
      );
      return candidateDistance < closestDistance ? candidate : closest;
    }).title;
  });

  function jumpToStop(stopId: string): void {
    selectedStopId = stopId;
    teleportToken += 1;
  }
</script>

<svelte:head>
  <title>Walk the Earth Root Observatory graybox</title>
  <meta
    name="description"
    content="Gate 2 first-person spatial review of the Blender-authored Earth Root Observatory."
  />
</svelte:head>

<main
  class="walk-page"
  data-player-x={position.x.toFixed(3)}
  data-player-y={position.y.toFixed(3)}
  data-player-z={position.z.toFixed(3)}
  data-performer-count={plan.performers.length}
  data-selected-stop={selectedStopId}
  data-asset-ready={assetReady}
>
  <div
    class="viewport"
    aria-label="Earth Root Observatory first-person graybox"
  >
    <Canvas dpr={1} shadows={PCFSoftShadowMap} toneMapping={AgXToneMapping}>
      <EarthRootObservatoryWalkScene
        {selectedStopId}
        {teleportToken}
        onAssetReady={() => (assetReady = true)}
        onPositionChange={(nextPosition) => (position = nextPosition)}
      />
    </Canvas>
  </div>

  <header class="review-hud">
    <div class="review-label">
      <p>Earth · Gate 2 spatial review</p>
      <h1>Root Observatory</h1>
      <span>{locationLabel}</span>
    </div>
    <ActionButton
      label="Reset to Fire"
      icon="fa-arrow-rotate-left"
      color="fuse"
      onclick={() => jumpToStop(plan.stops[0]!.id)}
    />
  </header>

  {#if !assetReady}
    <div class="loading" role="status" aria-live="polite">
      <span class="loading-mark" aria-hidden="true"></span>
      <div>
        <strong>Growing the observatory</strong>
        <span>Loading the Blender graybox</span>
      </div>
    </div>
  {/if}

  <aside class="route-review" aria-label="Review route">
    <div class="stop-copy">
      <div>
        <span class="step-kicker">Stop {selectedStop.number} of 7</span>
        <strong>{selectedStop.title}</strong>
      </div>
      <p>{selectedStop.focus}</p>
      <span class="response">Room response: {selectedStop.response}</span>
    </div>
    <SegmentedControl
      options={stopOptions}
      value={selectedStopId}
      onchange={jumpToStop}
      color="accent"
      size="sm"
      density="compact"
      semantics="radiogroup"
      ariaLabel="Jump to a Gate 2 route stop"
    />
  </aside>

  <aside class="ensemble-note" aria-label="Earth ensemble">
    <strong>G · H · I</strong>
    <span>Three continuous loops, one retained root memory</span>
  </aside>
</main>

<style>
  :global(body) {
    margin: 0;
    overflow: hidden;
    background: #030703;
  }

  .walk-page {
    --theme-accent: #83ad54;
    --theme-card-bg: rgba(6, 13, 6, 0.86);
    --theme-card-hover-bg: rgba(19, 35, 14, 0.94);
    --theme-stroke: rgba(215, 234, 190, 0.2);
    --theme-stroke-strong: rgba(143, 190, 87, 0.65);
    --theme-text: #f4f8e9;
    --theme-text-dim: #bdc9ac;
    --min-touch-target: 44px;
    --duration-normal: 160ms;
    position: fixed;
    inset: 0;
    min-inline-size: 20rem;
    overflow: hidden;
    color: var(--theme-text);
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  }

  .viewport {
    position: absolute;
    inset: 0;
  }

  .review-hud {
    position: absolute;
    inset-block-start: clamp(0.75rem, 1.5vw, 1.5rem);
    inset-inline: clamp(0.75rem, 1.5vw, 1.5rem);
    z-index: 60;
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 1rem;
    pointer-events: none;
  }

  .review-hud :global(button) {
    pointer-events: auto;
  }

  .review-label,
  .route-review,
  .ensemble-note,
  .loading {
    border: 1px solid var(--theme-stroke);
    background: var(--theme-card-bg);
    box-shadow:
      0 1rem 3rem rgba(0, 0, 0, 0.38),
      inset 0 1px rgba(255, 255, 255, 0.035);
    backdrop-filter: blur(0.8rem);
  }

  .review-label {
    min-inline-size: min(21rem, calc(100vw - 12rem));
    padding: 0.72rem 1rem 0.82rem;
    border-radius: 0.9rem;
  }

  .review-label p,
  .review-label h1,
  .stop-copy p {
    margin: 0;
  }

  .review-label p,
  .step-kicker {
    color: #a9cf72;
    font-size: 0.7rem;
    font-weight: 760;
    letter-spacing: 0.11em;
    text-transform: uppercase;
  }

  .review-label h1 {
    margin-block: 0.14rem 0.08rem;
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(1.4rem, 1.8vw, 2.2rem);
    font-weight: 540;
    line-height: 1;
  }

  .review-label span,
  .ensemble-note span {
    color: #d1dbc1;
    font-size: 0.84rem;
  }

  .route-review {
    position: absolute;
    inset-inline-start: 50%;
    inset-block-end: clamp(0.75rem, 1.5vw, 1.5rem);
    z-index: 65;
    display: grid;
    gap: 0.62rem;
    inline-size: min(45rem, calc(100vw - 1.5rem));
    padding: 0.82rem;
    border-radius: 0.95rem;
    transform: translateX(-50%);
  }

  .stop-copy {
    display: grid;
    grid-template-columns: minmax(8rem, 0.8fr) minmax(12rem, 1.2fr);
    gap: 0.18rem 1rem;
    align-items: end;
  }

  .stop-copy div {
    display: grid;
  }

  .stop-copy strong {
    color: #f3f7e9;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 1.08rem;
    font-weight: 550;
  }

  .stop-copy p {
    color: #d7dfca;
    font-size: 0.82rem;
    line-height: 1.35;
  }

  .response {
    grid-column: 1 / -1;
    color: #99ad84;
    font-size: 0.74rem;
    line-height: 1.35;
  }

  .ensemble-note {
    position: absolute;
    inset-inline-end: clamp(0.75rem, 1.5vw, 1.5rem);
    inset-block-end: clamp(0.75rem, 1.5vw, 1.5rem);
    z-index: 55;
    display: grid;
    gap: 0.1rem;
    padding: 0.64rem 0.82rem;
    border-radius: 0.8rem;
    text-align: end;
    pointer-events: none;
  }

  .ensemble-note strong,
  .loading strong {
    color: #eef6df;
    font-size: 0.8rem;
  }

  .loading {
    position: absolute;
    inset: 50% auto auto 50%;
    z-index: 70;
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0.85rem 1rem;
    border-radius: 0.9rem;
    transform: translate(-50%, -50%);
  }

  .loading div {
    display: grid;
    gap: 0.08rem;
  }

  .loading span:not(.loading-mark) {
    color: #bdc9ac;
    font-size: 0.82rem;
  }

  .loading-mark {
    inline-size: 0.85rem;
    block-size: 0.85rem;
    border: 2px solid rgba(203, 226, 157, 0.25);
    border-block-start-color: #a8c86a;
    border-radius: 50%;
    animation: turn 0.8s linear infinite;
  }

  @keyframes turn {
    to {
      transform: rotate(1turn);
    }
  }

  @media (min-width: 1680px) {
    .route-review {
      inline-size: min(54rem, calc(100vw - 2rem));
    }

    .stop-copy p,
    .review-label span,
    .ensemble-note span {
      font-size: 0.94rem;
    }

    .response {
      font-size: 0.82rem;
    }
  }

  @media (max-width: 64rem) {
    .ensemble-note {
      display: none;
    }
  }

  @media (max-width: 42rem) {
    .review-hud {
      align-items: stretch;
      flex-direction: column;
    }

    .review-label {
      min-inline-size: 0;
      inline-size: 100%;
    }

    .review-hud :global(button) {
      align-self: flex-end;
    }

    .route-review {
      gap: 0.5rem;
      padding: 0.68rem;
    }

    .stop-copy {
      grid-template-columns: 1fr;
    }

    .response {
      display: none;
    }
  }

  @media (max-height: 34rem) {
    .review-label p,
    .review-label span,
    .response {
      display: none;
    }

    .review-label {
      min-inline-size: 0;
      padding: 0.5rem 0.7rem;
    }

    .review-label h1 {
      margin: 0;
      font-size: 1.2rem;
    }

    .stop-copy {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .loading-mark {
      animation: none;
    }
  }
</style>
