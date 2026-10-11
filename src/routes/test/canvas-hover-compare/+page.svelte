<script lang="ts">
  import { onMount } from "svelte";
  import AnimatorCanvas from "#lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import { getSequenceRepository } from "#lib/shared/create/get-sequence-repository.js";
  import { getSettings } from "#lib/shared/application/state/app-state.svelte.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

  type HoverHint = "badge" | "pill" | "scrim" | "none";

  let sequenceData = $state<SequenceData | null>(null);
  let isPlaying = $state(false);
  let currentStep = $state(0);
  let animationInterval: number | null = null;

  const settings = getSettings();
  const leftPropType = settings.leftPropType || settings.propType;
  const rightPropType = settings.rightPropType || settings.propType;

  const variants: { hint: HoverHint; corner: boolean; title: string; blurb: string }[] = [
    { hint: "none", corner: true, title: "Corner play button", blurb: "Real button, top-right. Reveals on mouse hover (+ keyboard focus). Current pick." },
    { hint: "badge", corner: false, title: "Centered glass badge", blurb: "YouTube/Vimeo idiom — disc + word, dead center (mouse hover only)." },
    { hint: "pill", corner: false, title: "Corner caption pill", blurb: "Off-center label (mouse hover only)." },
    { hint: "scrim", corner: false, title: "Cursor + soft scrim", blurb: "Faint vignette, no icon (mouse hover only)." },
  ];

  onMount(async () => {
    try {
      const sequences = await getSequenceRepository().getAllSequences();
      if (sequences.length > 0) {
        sequenceData = sequences[0]!;
      }
    } catch (error) {
      console.error("Failed to load sequence:", error);
    }
  });

  function startClock() {
    if (!sequenceData || animationInterval !== null) return;
    const totalSteps = sequenceData.steps.length;
    animationInterval = window.setInterval(() => {
      currentStep = (currentStep + 0.05) % totalSteps;
    }, 50) as unknown as number;
  }

  function stopClock() {
    if (animationInterval !== null) {
      clearInterval(animationInterval);
      animationInterval = null;
    }
  }

  // Tapping any canvas toggles the shared clock so every variant reflects the
  // same play/pause state (and shows the matching hover icon).
  function togglePlayback() {
    isPlaying = !isPlaying;
    if (isPlaying) startClock();
    else stopClock();
  }

  function resetPlayback() {
    currentStep = 0;
    isPlaying = false;
    stopClock();
  }

  $effect(() => () => stopClock());
</script>

<svelte:head>
  <title>Canvas Hover Affordance Compare — Flow Arts Composer</title>
</svelte:head>

<div class="page">
  <div class="header">
    <h1>Canvas Hover Affordance</h1>
    <p class="subtitle">
      Hover each canvas with a mouse. Tap any to play/pause (the hint icon flips
      Pause ⇄ Play). All three are the real AnimatorCanvas.
    </p>
    <div class="playback">
      <button onclick={togglePlayback}>{isPlaying ? "⏸ Pause all" : "▶ Play all"}</button>
      <button onclick={resetPlayback}>↺ Reset</button>
      {#if sequenceData}
        <span class="seq">“{sequenceData.word || sequenceData.name || "Untitled"}” · {sequenceData.steps.length} steps</span>
      {/if}
    </div>
  </div>

  {#if !sequenceData}
    <div class="loading">
      <p>Loading sequence…</p>
      <p class="hint">Create at least one sequence in the app first.</p>
    </div>
  {:else}
    <div class="grid">
      {#each variants as v (v.hint)}
        <div class="cell">
          <div class="cell-head">
            <span class="badge">{v.corner ? "corner" : v.hint}</span>
            <h2>{v.title}</h2>
            <p>{v.blurb}</p>
          </div>
          <div class="canvas-box">
            <AnimatorCanvas
              leftProp={null}
              rightProp={null}
              {sequenceData}
              {currentStep}
              {isPlaying}
              {leftPropType}
              {rightPropType}
              gridVisible={true}
              backgroundAlpha={1}
              previewDarkMode={true}
              tapToToggle={true}
              progressLine={true}
              hoverHint={v.hint}
              cornerToggle={v.corner}
              onPlaybackToggle={togglePlayback}
              onProgressBarSeek={(target) => (currentStep = target)}
            />
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .page {
    min-height: 100vh;
    background: linear-gradient(135deg, #0f0f14 0%, #1a1a2e 100%);
    color: #fff;
    padding: 2rem;
    box-sizing: border-box;
  }

  .header {
    text-align: center;
    margin-bottom: 2rem;
  }

  h1 {
    font-size: clamp(1.75rem, 4vw, 2.5rem);
    font-weight: 800;
    margin: 0 0 0.5rem;
    background: linear-gradient(135deg, #00b8b8 0%, #00e5e5 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .subtitle {
    max-width: 720px;
    margin: 0 auto 1rem;
    color: #94a3b8;
    line-height: 1.5;
  }

  .playback {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
  }

  .seq {
    color: #64748b;
    font-size: 0.9rem;
    margin-left: 0.5rem;
  }

  button {
    padding: 0.5rem 1rem;
    font-size: 0.9rem;
    font-weight: 600;
    border: 1.5px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.05);
    color: #cbd5e1;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  button:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.3);
  }

  .loading {
    text-align: center;
    padding: 4rem 2rem;
    color: #cbd5e1;
  }

  .loading .hint {
    color: #64748b;
    font-size: 0.9rem;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 1.5rem;
    max-width: 1280px;
    margin: 0 auto;
  }

  .cell {
    background: rgba(255, 255, 255, 0.04);
    border: 1.5px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .cell-head h2 {
    margin: 0.4rem 0 0.25rem;
    font-size: 1.05rem;
    font-weight: 700;
  }

  .cell-head p {
    margin: 0;
    color: #94a3b8;
    font-size: 0.85rem;
    line-height: 1.4;
  }

  .cell-head .badge {
    display: inline-block;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #0f0f14;
    background: linear-gradient(135deg, #00b8b8 0%, #00e5e5 100%);
    padding: 2px 8px;
    border-radius: 999px;
  }

  .canvas-box {
    aspect-ratio: 1;
    width: 100%;
    border-radius: 10px;
    overflow: hidden;
    background: #000;
  }
</style>
