<script lang="ts">
  import { browser } from "$app/env";
  import { Canvas } from "@threlte/core";
  import { AgXToneMapping, PCFSoftShadowMap, WebGLRenderer } from "three";
  import ActionButton from "#lib/shared/components/selection/ActionButton.svelte";
  import FlowFestGrayboxWalkScene from "./FlowFestGrayboxWalkScene.svelte";
  import type { FlowFestGrayboxReadyDetails } from "./flow-fest-graybox-types";
  import type { FlowFestBranchId } from "./flow-fest-runtime-contract";
  import type { FlowFestTerrainHostMode } from "./flow-fest-terrain-host";

  const BRANCHES: Array<{
    id: FlowFestBranchId;
    label: string;
    vehicle: string;
  }> = [
    {
      id: "lower-tent",
      label: "Lower tent",
      vehicle: "Car ends in west upper parking",
    },
    {
      id: "upper-tent",
      label: "Upper tent",
      vehicle: "Car ends in west upper parking",
    },
    {
      id: "car-camp",
      label: "Car camp",
      vehicle: "Car stays at camp",
    },
  ];

  const CAMERAS = [
    { id: "lower-gate", label: "Gate" },
    { id: "lower-level", label: "Lower camps" },
    { id: "upper-parking", label: "Upper parking" },
    { id: "middle-earth", label: "Middle Earth" },
    { id: "night-composition", label: "Night view" },
  ];

  const requestedHost = browser
    ? new URLSearchParams(window.location.search).get("host")
    : null;
  const hostMode: FlowFestTerrainHostMode =
    requestedHost === "bounded-static" ? "bounded-static" : "chunked";

  let selectedBranch = $state<FlowFestBranchId>("lower-tent");
  let resetToken = $state(0);
  let cameraToken = $state(0);
  let cameraId = $state<string | null>(null);
  let sceneKey = $state(0);
  let position = $state({ x: 340, y: 12, z: -20 });
  let ready = $state<FlowFestGrayboxReadyDetails | null>(null);
  let error = $state<string | null>(null);

  const selected = $derived(
    BRANCHES.find((branch) => branch.id === selectedBranch) ?? BRANCHES[0]!
  );

  function chooseCamera(nextCameraId: string): void {
    cameraId = nextCameraId;
    cameraToken += 1;
  }

  function retry(): void {
    error = null;
    ready = null;
    sceneKey += 1;
  }
</script>

<svelte:head>
  <title>Flow Fest Sim · Measured Earth Graybox</title>
  <meta
    name="description"
    content="First-person Gate 2 review of the measured Flow Fest Sim terrain and traced arrival routes."
  />
</svelte:head>

<main
  class="walk-page"
  data-runtime-status={error ? "error" : ready ? "ready" : "loading"}
  data-host-mode={hostMode}
  data-selected-branch={selectedBranch}
  data-player-x={position.x.toFixed(3)}
  data-player-y={position.y.toFixed(3)}
  data-player-z={position.z.toFixed(3)}
  data-barrier-cells={ready?.barrierCells ?? 0}
  data-eye-height={ready?.eyeHeightMeters ?? 0}
>
  <div class="viewport" aria-label="Flow Fest Sim measured terrain graybox">
    <Canvas
      dpr={1}
      shadows={PCFSoftShadowMap}
      toneMapping={AgXToneMapping}
      createRenderer={(canvas) =>
        new WebGLRenderer({ canvas, preserveDrawingBuffer: true })}
    >
      {#key sceneKey}
        <FlowFestGrayboxWalkScene
          {resetToken}
          {cameraToken}
          {cameraId}
          {selectedBranch}
          {hostMode}
          onReady={(details) => {
            ready = details;
            error = null;
          }}
          onPositionChange={(nextPosition) => (position = nextPosition)}
          onError={(message) => (error = message)}
        />
      {/key}
    </Canvas>
  </div>

  <header class="review-hud">
    <section class="review-title" aria-label="Flow Fest Gate 2 review">
      <p>Gate 2 · measured Earth graybox</p>
      <h1>Flow Fest Sim</h1>
      <div class="status-line">
        <span class="status-dot" class:ready aria-hidden="true"></span>
        <span
          >{ready
            ? "Terrain + collision ready"
            : "Checking source-locked terrain"}</span
        >
      </div>
    </section>

    <section class="terrain-proof" aria-label="Runtime terrain proof">
      <span>Full 1 m DTM</span>
      <strong
        >{hostMode === "bounded-static"
          ? "Bounded host"
          : "32 m collision host"}</strong
      >
      {#if ready}
        <small>
          {ready.vertices.toLocaleString()} vertices · {ready.colliderMeshes}
          colliders
        </small>
      {/if}
    </section>
  </header>

  <section class="branch-panel" aria-label="Camping branch">
    <div class="panel-heading">
      <div>
        <span>Arrival branch</span>
        <strong>{selected.label}</strong>
      </div>
      <p>{selected.vehicle}</p>
    </div>
    <div class="branch-buttons">
      {#each BRANCHES as branch}
        <button
          type="button"
          class:active={branch.id === selectedBranch}
          aria-pressed={branch.id === selectedBranch}
          onclick={() => (selectedBranch = branch.id)}
        >
          {branch.label}
        </button>
      {/each}
    </div>
    <span class="route-key"
      >Bright route = selected branch · muted routes = alternatives</span
    >
  </section>

  <nav class="camera-panel" aria-label="Registered review cameras">
    <span>Registered views</span>
    <div class="camera-buttons">
      {#each CAMERAS as camera}
        <button type="button" onclick={() => chooseCamera(camera.id)}>
          {camera.label}
        </button>
      {/each}
    </div>
  </nav>

  <aside class="walk-note">
    <strong>Walk the measured ground</strong>
    <span>Click the terrain, then use WASD and the mouse.</span>
    <span
      >Review speed is locked to 1.2 m/s. Sprint, jump, crouch, and noclip are
      off.</span
    >
  </aside>

  <div class="reset-action">
    <ActionButton
      label="Reset to gate"
      icon="fa-arrow-rotate-left"
      color="fuse"
      onclick={() => (resetToken += 1)}
    />
  </div>

  {#if !ready && !error}
    <div class="loading" role="status" aria-live="polite">
      <span class="loading-mark" aria-hidden="true"></span>
      <div>
        <strong>Building the one-metre terrain</strong>
        <span>Verifying 1,050,625 samples before the player can move</span>
      </div>
    </div>
  {/if}

  {#if error}
    <div class="error-card" role="alert">
      <div>
        <strong>The measured world did not open</strong>
        <span>{error}</span>
      </div>
      <ActionButton
        label="Retry"
        icon="fa-arrow-rotate-right"
        color="fuse"
        onclick={retry}
      />
    </div>
  {/if}
</main>

<style>
  :global(body) {
    margin: 0;
    overflow: hidden;
    background: #7c8979;
  }

  .walk-page {
    --panel: rgba(18, 28, 23, 0.88);
    --panel-strong: rgba(15, 24, 20, 0.95);
    --stroke: rgba(229, 242, 223, 0.2);
    --stroke-strong: rgba(255, 193, 103, 0.72);
    --text: #f7f6ec;
    --muted: #c7d1c2;
    --accent: #ffbd68;
    --min-touch-target: 44px;
    position: fixed;
    inset: 0;
    min-inline-size: 20rem;
    overflow: hidden;
    color: var(--text);
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  }

  .viewport {
    position: absolute;
    inset: 0;
  }

  .review-hud {
    position: absolute;
    inset-block-start: clamp(0.75rem, 1.4vw, 1.5rem);
    inset-inline: clamp(0.75rem, 1.4vw, 1.5rem);
    z-index: 50;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    pointer-events: none;
  }

  .review-title,
  .terrain-proof,
  .branch-panel,
  .camera-panel,
  .walk-note,
  .loading,
  .error-card {
    border: 1px solid var(--stroke);
    background: var(--panel);
    box-shadow:
      0 1.2rem 3.5rem rgba(3, 10, 6, 0.26),
      inset 0 1px rgba(255, 255, 255, 0.045);
    backdrop-filter: blur(0.75rem);
  }

  .review-title {
    min-inline-size: min(23rem, calc(100vw - 14rem));
    padding: 0.78rem 1rem 0.88rem;
    border-radius: 0.95rem;
  }

  .review-title p,
  .review-title h1,
  .branch-panel p {
    margin: 0;
  }

  .review-title p,
  .panel-heading span,
  .camera-panel > span {
    color: var(--accent);
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.11em;
    text-transform: uppercase;
  }

  .review-title h1 {
    margin-block: 0.14rem 0.24rem;
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(1.55rem, 2vw, 2.5rem);
    font-weight: 560;
    line-height: 1;
  }

  .status-line {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    color: var(--muted);
    font-size: 0.85rem;
  }

  .status-dot {
    inline-size: 0.55rem;
    block-size: 0.55rem;
    border: 2px solid rgba(255, 255, 255, 0.35);
    border-block-start-color: var(--accent);
    border-radius: 50%;
    animation: turn 0.8s linear infinite;
  }

  .status-dot.ready {
    border: 0;
    background: #71dfa0;
    box-shadow: 0 0 0.8rem rgba(113, 223, 160, 0.65);
    animation: none;
  }

  .terrain-proof {
    display: grid;
    justify-items: end;
    gap: 0.08rem;
    padding: 0.72rem 0.9rem;
    border-radius: 0.85rem;
    text-align: end;
  }

  .terrain-proof span,
  .terrain-proof small {
    color: var(--muted);
    font-size: 0.75rem;
  }

  .terrain-proof strong {
    font-size: 0.92rem;
  }

  .branch-panel,
  .camera-panel {
    position: absolute;
    z-index: 45;
    inset-block-end: clamp(0.75rem, 1.4vw, 1.5rem);
    padding: 0.82rem;
    border-radius: 0.95rem;
  }

  .branch-panel {
    inset-inline-start: clamp(0.75rem, 1.4vw, 1.5rem);
    inline-size: min(28rem, calc(100vw - 2rem));
  }

  .panel-heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 1rem;
  }

  .panel-heading div {
    display: grid;
    gap: 0.1rem;
  }

  .panel-heading strong {
    font-size: 1.03rem;
  }

  .panel-heading p {
    max-inline-size: 13rem;
    color: var(--muted);
    font-size: 0.78rem;
    text-align: end;
  }

  .branch-buttons,
  .camera-buttons {
    display: flex;
    gap: 0.38rem;
  }

  .branch-buttons {
    margin-block-start: 0.65rem;
  }

  .branch-buttons button,
  .camera-buttons button {
    min-block-size: var(--min-touch-target);
    border: 1px solid var(--stroke);
    border-radius: 0.68rem;
    background: rgba(255, 255, 255, 0.055);
    color: var(--text);
    font: inherit;
    font-size: 0.8rem;
    font-weight: 720;
    cursor: pointer;
    transition:
      border-color 140ms ease,
      background 140ms ease,
      transform 140ms ease;
  }

  .branch-buttons button {
    flex: 1;
    padding-inline: 0.72rem;
  }

  .branch-buttons button:hover,
  .branch-buttons button:focus-visible,
  .camera-buttons button:hover,
  .camera-buttons button:focus-visible {
    border-color: var(--stroke-strong);
    outline: none;
  }

  .branch-buttons button.active {
    border-color: var(--stroke-strong);
    background: rgba(255, 189, 104, 0.2);
    color: #fff7e7;
  }

  .route-key {
    display: block;
    margin-block-start: 0.48rem;
    color: var(--muted);
    font-size: 0.72rem;
  }

  .camera-panel {
    inset-inline-end: clamp(0.75rem, 1.4vw, 1.5rem);
    inline-size: 12rem;
  }

  .camera-buttons {
    flex-direction: column;
    margin-block-start: 0.55rem;
  }

  .camera-buttons button {
    inline-size: 100%;
    padding-inline: 0.7rem;
    text-align: start;
  }

  .walk-note {
    position: absolute;
    inset-inline-start: 50%;
    inset-block-end: clamp(0.75rem, 1.4vw, 1.5rem);
    z-index: 42;
    display: grid;
    gap: 0.12rem;
    inline-size: min(31rem, calc(100vw - 44rem));
    padding: 0.72rem 0.9rem;
    border-radius: 0.86rem;
    transform: translateX(-50%);
    text-align: center;
    pointer-events: none;
  }

  .walk-note strong {
    font-size: 0.82rem;
  }

  .walk-note span {
    color: var(--muted);
    font-size: 0.76rem;
  }

  .reset-action {
    position: absolute;
    inset-block-start: clamp(6.8rem, 10vw, 8.5rem);
    inset-inline-start: clamp(0.75rem, 1.4vw, 1.5rem);
    z-index: 55;
  }

  .loading,
  .error-card {
    position: absolute;
    inset: 50% auto auto 50%;
    z-index: 70;
    display: flex;
    align-items: center;
    gap: 0.8rem;
    max-inline-size: min(32rem, calc(100vw - 2rem));
    padding: 0.9rem 1rem;
    border-radius: 0.95rem;
    transform: translate(-50%, -50%);
  }

  .loading div,
  .error-card div {
    display: grid;
    gap: 0.12rem;
  }

  .loading span,
  .error-card span {
    color: var(--muted);
    font-size: 0.82rem;
  }

  .loading-mark {
    flex: 0 0 auto;
    inline-size: 0.9rem;
    block-size: 0.9rem;
    border: 2px solid rgba(255, 255, 255, 0.2);
    border-block-start-color: var(--accent);
    border-radius: 50%;
    animation: turn 0.8s linear infinite;
  }

  @keyframes turn {
    to {
      transform: rotate(1turn);
    }
  }

  @media (max-width: 74rem) {
    .walk-note {
      display: none;
    }
  }

  @media (max-width: 48rem) {
    .terrain-proof {
      display: none;
    }

    .review-title {
      min-inline-size: 0;
      max-inline-size: calc(100vw - 1.5rem);
    }

    .camera-panel {
      inset-inline: 0.75rem;
      inset-block-end: 8.9rem;
      inline-size: auto;
      padding: 0.68rem;
    }

    .camera-buttons {
      flex-direction: row;
      overflow-x: auto;
    }

    .camera-buttons button {
      flex: 0 0 auto;
      inline-size: auto;
    }

    .branch-panel {
      inset-inline: 0.75rem;
      inline-size: auto;
    }

    .panel-heading p,
    .route-key {
      display: none;
    }

    .reset-action {
      inset-block-start: 6.6rem;
    }
  }

  @media (max-height: 31rem) and (min-width: 40rem) {
    .review-title {
      padding-block: 0.55rem;
    }

    .review-title h1 {
      font-size: 1.3rem;
    }

    .status-line,
    .terrain-proof,
    .route-key,
    .camera-panel > span,
    .panel-heading p {
      display: none;
    }

    .reset-action {
      inset-block-start: 0.75rem;
      inset-inline: auto 0.75rem;
    }

    .branch-panel {
      inline-size: 25rem;
      padding: 0.58rem;
    }

    .branch-buttons {
      margin-block-start: 0.35rem;
    }

    .camera-panel {
      inset-inline-end: 0.75rem;
      inline-size: auto;
      padding: 0.48rem;
    }

    .camera-buttons {
      flex-direction: row;
      margin: 0;
    }

    .camera-buttons button {
      inline-size: auto;
    }
  }

  @media (min-width: 1680px) {
    .walk-page {
      font-size: 1.08rem;
    }
  }

  @media (min-width: 2600px) {
    .walk-page {
      font-size: 1.38rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .loading-mark,
    .status-dot {
      animation: none;
    }

    .branch-buttons button,
    .camera-buttons button {
      transition: none;
    }
  }
</style>
