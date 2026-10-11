<script lang="ts">
  import { browser } from "$app/env";
  import { Canvas } from "@threlte/core";
  import { AgXToneMapping, PCFSoftShadowMap, WebGLRenderer } from "three";
  import ActionButton from "#lib/shared/components/selection/ActionButton.svelte";
  import FirstFireGrayboxWalkScene from "./FirstFireGrayboxWalkScene.svelte";
  import { captureCurrentView } from "#lib/shared/review/view-capture.js";

  interface ReviewDetails {
    phase: string;
    label: string;
    activeShrineId: "dj" | "ek" | "fl" | null;
    displayedShrineId: "dj" | "ek" | "fl" | null;
    orbitProgress: Record<"dj" | "ek" | "fl", number>;
    blackoutElapsedMs: number;
    performer: {
      performerId: string;
      sequenceId: string;
      catalogId: string;
      word: string;
    } | null;
  }

  const initialReview: ReviewDetails = {
    phase: "approach",
    label: "DJ gate kindled",
    activeShrineId: null,
    displayedShrineId: null,
    orbitProgress: { dj: 0, ek: 0, fl: 0 },
    blackoutElapsedMs: 0,
    performer: null,
  };

  let assetReady = $state(false);
  let flameCount = $state(0);
  let resetToken = $state(0);
  let reviewAdvanceToken = $state(0);

  // Deterministic evidence captures: ?proof=N auto-advances N authored
  // states once assets are ready, so headless screenshots can reach any
  // review state without input.
  const proofSteps = browser
    ? Number(new URLSearchParams(window.location.search).get("proof") ?? "0")
    : 0;
  let proofStepsTaken = 0;
  $effect(() => {
    if (!assetReady || proofStepsTaken > 0 || proofSteps <= 0) return;
    const timer = setInterval(() => {
      reviewAdvanceToken += 1;
      proofStepsTaken += 1;
      if (proofStepsTaken >= proofSteps) clearInterval(timer);
    }, 600);
    return () => clearInterval(timer);
  });
  /** Transient confirmation under the HUD button. Cleared on the next capture. */
  let captureNote = $state<string | null>(null);
  let captureNoteTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * The HUD affordance for the global U shortcut. U itself is handled at the
   * root layout; this button exists because a keystroke alone is not
   * discoverable.
   */
  async function copyCurrentView() {
    const capture = await captureCurrentView();
    if (captureNoteTimer) clearTimeout(captureNoteTimer);
    const failed = "frameError" in capture ? capture.frameError : undefined;
    captureNote = failed
      ? `Pose copied, no frame: ${failed}`
      : "Copied - paste to Claude";
    captureNoteTimer = setTimeout(() => (captureNote = null), 4000);
  }

  let position = $state({ x: -27, y: 0.88, z: 0 });
  let review = $state<ReviewDetails>(initialReview);

  const proofButtonLabel = $derived(
    review.phase === "growth-complete" ? "Restart proof" : "Next proof state"
  );

  const revealNote = $derived(
    review.phase === "growth-complete"
      ? "The fire is out. The green route follows the walk you already took."
      : review.phase === "fire-extinguished"
        ? "Every fire is out. Nothing green has appeared yet."
        : "Performer hidden until you turn into the court mouth."
  );
</script>

<svelte:head>
  <title>Walk The First Fire: Cinder Court</title>
  <meta
    name="description"
    content="Interactive first-person spatial review of The First Fire Cinder Court graybox."
  />
</svelte:head>

<main
  class="walk-page"
  data-player-x={position.x.toFixed(3)}
  data-player-y={position.y.toFixed(3)}
  data-player-z={position.z.toFixed(3)}
  data-flame-count={flameCount}
  data-review-phase={review.phase}
  data-active-shrine={review.activeShrineId ?? "none"}
  data-displayed-shrine={review.displayedShrineId ?? "none"}
  data-live-word={review.performer?.word ?? "none"}
  data-live-sequence-id={review.performer?.sequenceId ?? "none"}
  data-live-catalog-id={review.performer?.catalogId ?? "none"}
  data-blackout-ms={Math.round(review.blackoutElapsedMs)}
>
  <div class="viewport" aria-label="The First Fire Cinder Court graybox">
    <Canvas
      dpr={1}
      shadows={PCFSoftShadowMap}
      toneMapping={AgXToneMapping}
      createRenderer={(canvas) =>
        new WebGLRenderer({ canvas, preserveDrawingBuffer: true })}
    >
      <FirstFireGrayboxWalkScene
        {resetToken}
        {reviewAdvanceToken}
        onAssetReady={(details) => {
          flameCount = details.flameCount;
          assetReady = true;
        }}
        onPositionChange={(nextPosition) => (position = nextPosition)}
        onReviewChange={(details) => (review = details)}
      />
    </Canvas>
  </div>

  <header class="review-hud">
    <section class="review-label" aria-label="Cinder Court review state">
      <p>Vulcan Cave · Gate 2 interaction proof</p>
      <div class="title-line">
        <h1>The Cinder Court</h1>
        <span class="phase-chip">{review.label}</span>
      </div>
      {#if review.performer}
        <dl class="live-proof">
          <div>
            <dt>Live word</dt>
            <dd>{review.performer.word}</dd>
          </div>
          <div>
            <dt>Sequence</dt>
            <dd>{review.performer.sequenceId}</dd>
          </div>
          <div>
            <dt>Catalog</dt>
            <dd>{review.performer.catalogId}</dd>
          </div>
        </dl>
      {:else}
        <span class="reveal-note">{revealNote}</span>
      {/if}
    </section>

    <nav class="review-actions" aria-label="Graybox review controls">
      <ActionButton
        label={proofButtonLabel}
        icon="fa-forward-step"
        color="fuse"
        onclick={() => (reviewAdvanceToken += 1)}
      />
      <ActionButton
        label="Copy view"
        icon="fa-camera"
        color="default"
        onclick={copyCurrentView}
      />
      <ActionButton
        label="Reset to Water"
        icon="fa-arrow-rotate-left"
        color="default"
        onclick={() => (resetToken += 1)}
      />
    </nav>
  </header>

  {#if !assetReady}
    <div class="loading" role="status" aria-live="polite">
      <span class="loading-mark" aria-hidden="true"></span>
      <div>
        <strong>Opening the Cinder Court</strong>
        <span>Loading the measured Blender graybox</span>
      </div>
    </div>
  {/if}

  <aside class="walk-note">
    <strong>Walk the ordinary route</strong>
    <span>Click the room, then use WASD and the mouse. Shift sprints.</span>
    <span class="review-shortcut"
      >Review shortcut: advance one authored state at a time.</span
    >
    <span class="review-shortcut"
      >Press U (or Copy view) to copy this exact view for Claude.</span
    >
    {#if captureNote}
      <span class="capture-note" role="status" aria-live="polite"
        >{captureNote}</span
      >
    {/if}
  </aside>
</main>

<style>
  :global(body) {
    margin: 0;
    overflow: hidden;
    background: #040303;
  }

  .walk-page {
    --theme-accent: #f97316;
    --theme-card-bg: rgba(18, 8, 5, 0.86);
    --theme-card-hover-bg: rgba(42, 15, 7, 0.94);
    --theme-stroke: rgba(255, 218, 185, 0.2);
    --theme-stroke-strong: rgba(251, 146, 60, 0.58);
    --theme-text: #fff7ed;
    --theme-text-on-accent: #170802;
    --min-touch-target: 44px;
    --duration-normal: 160ms;
    position: fixed;
    inset: 0;
    min-inline-size: 20rem;
    overflow: hidden;
    color: var(--theme-text);
    font-family:
      Inter,
      ui-sans-serif,
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      sans-serif;
  }

  .viewport {
    position: absolute;
    inset: 0;
  }

  .capture-note {
    color: var(--theme-accent);
    font-weight: 600;
  }

  .review-hud {
    position: absolute;
    inset-block-start: clamp(0.8rem, 1.5vw, 1.5rem);
    inset-inline: clamp(0.8rem, 1.5vw, 1.5rem);
    z-index: 60;
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 1rem;
    pointer-events: none;
  }

  .review-actions {
    display: flex;
    flex: 0 0 auto;
    gap: 0.7rem;
    pointer-events: auto;
  }

  .review-actions :global(button) {
    min-inline-size: 10.5rem;
  }

  .review-actions :global(button[data-color="default"]) {
    --action-gradient: linear-gradient(135deg, #251914, #3a241b);
    --action-shadow: 0 4px 12px rgba(0, 0, 0, 0.28);
    --action-shadow-hover: 0 6px 16px rgba(0, 0, 0, 0.38);
    --action-focus: #fed7aa;
  }

  .review-label,
  .walk-note,
  .loading {
    border: 1px solid rgba(255, 218, 185, 0.18);
    background: rgba(10, 5, 4, 0.78);
    box-shadow:
      0 1rem 3rem rgba(0, 0, 0, 0.34),
      inset 0 1px rgba(255, 255, 255, 0.035);
    backdrop-filter: blur(0.7rem);
  }

  .review-label {
    inline-size: min(42rem, calc(100vw - 25rem));
    min-block-size: 7.5rem;
    padding: 0.78rem 1rem 0.9rem;
    border-radius: 0.9rem;
  }

  .review-label p,
  .review-label h1 {
    margin: 0;
  }

  .review-label > p {
    color: #fb923c;
    font-size: 0.75rem;
    font-weight: 760;
    letter-spacing: 0.11em;
    text-transform: uppercase;
  }

  .title-line {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    margin-block: 0.18rem 0.65rem;
  }

  .review-label h1 {
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(1.45rem, 1.8vw, 2.25rem);
    font-weight: 540;
    line-height: 1;
  }

  .phase-chip {
    flex: 0 0 auto;
    color: #fed7aa;
    font-size: 0.84rem;
    font-variant-numeric: tabular-nums;
  }

  .live-proof {
    display: grid;
    grid-template-columns: 0.7fr 1.2fr 1.55fr;
    gap: 0.45rem 1rem;
    margin: 0;
  }

  .live-proof div {
    min-inline-size: 0;
  }

  .live-proof dt {
    color: #a99588;
    font-size: 0.72rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .live-proof dd {
    margin: 0.12rem 0 0;
    overflow: hidden;
    color: #fff1e6;
    font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
    font-size: 0.82rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .reveal-note {
    color: #c6b6ab;
    font-size: 0.88rem;
  }

  .walk-note {
    position: absolute;
    inset-inline-start: 50%;
    inset-block-end: clamp(1rem, 2vw, 2rem);
    z-index: 45;
    display: flex;
    align-items: center;
    gap: 0.8rem;
    max-inline-size: min(62rem, calc(100vw - 2rem));
    padding: 0.72rem 1rem;
    border-radius: 0.8rem;
    transform: translateX(-50%);
    pointer-events: none;
  }

  .walk-note strong {
    flex: 0 0 auto;
    color: #ffedd5;
    font-size: 0.88rem;
  }

  .walk-note span {
    color: #c7b8ad;
    font-size: 0.82rem;
    line-height: 1.35;
  }

  .walk-note .review-shortcut {
    padding-inline-start: 0.8rem;
    border-inline-start: 1px solid rgba(251, 146, 60, 0.35);
    color: #f3b988;
  }

  .loading {
    position: absolute;
    inset: 50% auto auto 50%;
    z-index: 70;
    display: flex;
    align-items: center;
    gap: 0.9rem;
    min-inline-size: 18rem;
    padding: 1rem 1.2rem;
    border-radius: 1rem;
    transform: translate(-50%, -50%);
  }

  .loading div {
    display: grid;
    gap: 0.15rem;
  }

  .loading strong {
    color: #fff7ed;
    font-size: 0.96rem;
  }

  .loading span:not(.loading-mark) {
    color: #bdaea3;
    font-size: 0.82rem;
  }

  .loading-mark {
    inline-size: 1.1rem;
    block-size: 1.1rem;
    border: 2px solid rgba(251, 146, 60, 0.25);
    border-block-start-color: #fb923c;
    border-radius: 50%;
    animation: spin 720ms linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(1turn);
    }
  }

  @media (min-width: 1680px) {
    .review-label {
      padding: 0.95rem 1.2rem 1rem;
    }

    .review-label > p,
    .live-proof dt {
      font-size: 0.8rem;
    }

    .phase-chip,
    .reveal-note,
    .walk-note strong {
      font-size: 1rem;
    }

    .live-proof dd,
    .walk-note span {
      font-size: 0.92rem;
    }
  }

  @media (min-width: 2600px) {
    .review-hud {
      inset-block-start: 2rem;
      inset-inline: 2rem;
    }

    .review-label {
      inline-size: min(62rem, calc(100vw - 38rem));
      min-block-size: 11rem;
      padding: 1.35rem 1.65rem 1.5rem;
      border-radius: 1.4rem;
    }

    .review-label > p,
    .live-proof dt {
      font-size: 1.05rem;
    }

    .review-label h1 {
      margin-block: 0.28rem 0.2rem;
      font-size: 3.2rem;
    }

    .phase-chip,
    .reveal-note {
      font-size: 1.3rem;
    }

    .live-proof dd {
      font-size: 1.2rem;
    }

    .review-actions {
      gap: 1rem;
    }

    .review-actions :global(button) {
      min-block-size: 4.25rem;
      min-inline-size: 14rem;
      padding: 1.15rem 2rem;
      border-radius: 1.6rem;
      font-size: 1.25rem;
    }

    .walk-note {
      gap: 1.15rem;
      max-inline-size: 80rem;
      padding: 1.1rem 1.5rem;
      border-radius: 1.25rem;
    }

    .walk-note strong {
      font-size: 1.3rem;
    }

    .walk-note span {
      font-size: 1.15rem;
    }
  }

  @media (max-width: 64rem) {
    .review-hud {
      align-items: stretch;
      flex-direction: column;
    }

    .review-label {
      inline-size: 100%;
    }

    .review-actions {
      align-self: flex-end;
    }
  }

  @media (max-width: 42rem) {
    .review-label {
      min-block-size: 0;
    }

    .title-line {
      align-items: start;
      flex-direction: column;
      gap: 0.3rem;
    }

    .live-proof {
      grid-template-columns: 1fr;
    }

    .live-proof div:not(:first-child) {
      display: none;
    }

    .review-actions {
      inline-size: 100%;
    }

    .review-actions :global(button) {
      flex: 1 1 0;
      min-inline-size: 0;
    }

    .walk-note {
      align-items: start;
      flex-direction: column;
      gap: 0.25rem;
    }

    .review-shortcut {
      display: none;
    }
  }

  @media (max-height: 31rem) {
    .review-label > p,
    .phase-chip,
    .live-proof,
    .reveal-note,
    .walk-note {
      display: none;
    }

    .review-label {
      inline-size: auto;
      min-block-size: 0;
      padding: 0.55rem 0.75rem;
    }

    .title-line {
      margin: 0;
    }

    .review-label h1 {
      margin: 0;
      font-size: 1.25rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .loading-mark {
      animation-duration: 1.6s;
    }
  }
</style>
