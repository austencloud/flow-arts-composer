<script lang="ts">
  import { onMount } from "svelte";
  import AnimatorCanvas from "#lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import { getSequenceRepository } from "#lib/shared/create/get-sequence-repository.js";
  import { getSettings } from "#lib/shared/application/state/app-state.svelte.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

  // Sequence state
  let sequenceData = $state<SequenceData | null>(null);
  let isPlaying = $state(false);
  let currentStep = $state(0);
  let animationInterval: number | null = null;

  // Progress bar variant switcher
  let progressBarVariant = $state<"minimal" | "raised" | "rounded" | "neon" | "gradient" | "labeled" | "gradient-labeled">("gradient-labeled");

  // Prop types (using settings defaults)
  const settings = getSettings();
  const leftPropType = settings.leftPropType || settings.propType;
  const rightPropType = settings.rightPropType || settings.propType;

  onMount(async () => {
    // Load a real sequence from the user's data
    const sequenceRepository = getSequenceRepository();

    try {
      // Fetch user's sequences from local IndexedDB
      const sequences = await sequenceRepository.getAllSequences();

      if (sequences.length > 0) {
        // Use the first sequence found
        const seq = sequences[0]!;
        sequenceData = seq;
        console.log("Loaded sequence:", seq.word || seq.name);
      } else {
        console.warn("No sequences found - you need to create a sequence first");
      }
    } catch (error) {
      console.error("Failed to load sequence:", error);
    }
  });

  function togglePlayback() {
    isPlaying = !isPlaying;

    if (isPlaying && sequenceData) {
      const totalSteps = sequenceData.steps.length;
      animationInterval = window.setInterval(() => {
        currentStep = (currentStep + 0.05) % totalSteps;
      }, 50) as unknown as number;
    } else if (animationInterval !== null) {
      clearInterval(animationInterval);
      animationInterval = null;
    }
  }

  function resetPlayback() {
    currentStep = 0;
    if (isPlaying) {
      isPlaying = false;
      if (animationInterval !== null) {
        clearInterval(animationInterval);
        animationInterval = null;
      }
    }
  }

  // Cleanup on unmount
  $effect(() => {
    return () => {
      if (animationInterval !== null) {
        clearInterval(animationInterval);
      }
    };
  });

  // Update WordHeader with variant
  // This is done by passing the variant through AnimatorCanvas -> WordHeader
  // We'll need to add a progressBarVariant prop to AnimatorCanvas
</script>

<svelte:head>
  <title>Progress Bar in Context - Flow Arts Composer</title>
</svelte:head>

<div class="page">
  <div class="header">
    <h1>Segmented Progress Bar</h1>
    <p class="subtitle">Testing in real animation context</p>
  </div>

  {#if !sequenceData}
    <div class="loading">
      <p>Loading sequence...</p>
      <p class="hint">Make sure you have at least one sequence created in the app</p>
    </div>
  {:else}
    <div class="content">
      <!-- Variant switcher -->
      <div class="controls-panel">
        <div class="control-group">
          <div class="control-label" id="progress-bar-style-label">Progress Bar Style:</div>
          <div class="variant-buttons" role="group" aria-labelledby="progress-bar-style-label">
            <button
              class:active={progressBarVariant === "minimal"}
              onclick={() => (progressBarVariant = "minimal")}
            >
              Minimal
            </button>
            <button
              class:active={progressBarVariant === "raised"}
              onclick={() => (progressBarVariant = "raised")}
            >
              Raised
            </button>
            <button
              class:active={progressBarVariant === "rounded"}
              onclick={() => (progressBarVariant = "rounded")}
            >
              Rounded
            </button>
            <button
              class:active={progressBarVariant === "neon"}
              onclick={() => (progressBarVariant = "neon")}
            >
              Neon
            </button>
            <button
              class:active={progressBarVariant === "gradient"}
              onclick={() => (progressBarVariant = "gradient")}
            >
              Gradient
            </button>
            <button
              class:active={progressBarVariant === "labeled"}
              onclick={() => (progressBarVariant = "labeled")}
            >
              Labeled
            </button>
            <button
              class:active={progressBarVariant === "gradient-labeled"}
              onclick={() => (progressBarVariant = "gradient-labeled")}
            >
              Gradient-Labeled
            </button>
          </div>
        </div>

        <div class="control-group">
          <div class="control-label" id="playback-label">Playback:</div>
          <div class="playback-buttons" role="group" aria-labelledby="playback-label">
            <button onclick={togglePlayback}>
              {isPlaying ? "⏸ Pause" : "▶ Play"}
            </button>
            <button onclick={resetPlayback}>
              ↺ Reset
            </button>
          </div>
        </div>

        <div class="sequence-info">
          <div class="info-item">
            <span class="label">Sequence:</span>
            <span class="value">{sequenceData.word || sequenceData.name || "Untitled"}</span>
          </div>
          <div class="info-item">
            <span class="label">Steps:</span>
            <span class="value">{sequenceData.steps.length}</span>
          </div>
          <div class="info-item">
            <span class="label">Current Step:</span>
            <span class="value">{Math.floor(currentStep) + 1}</span>
          </div>
        </div>
      </div>

      <!-- Animation canvas -->
      <div class="canvas-container">
        <AnimatorCanvas
          leftProp={null}
          rightProp={null}
          {sequenceData}
          {currentStep}
          {isPlaying}
          leftPropType={leftPropType}
          rightPropType={rightPropType}
          gridVisible={true}
          backgroundAlpha={1}
          previewDarkMode={true}
          progressBarVariant={progressBarVariant}
        />
      </div>
    </div>
  {/if}
</div>

<style>
  .page {
    min-height: 100vh;
    background: linear-gradient(135deg, #0f0f14 0%, #1a1a2e 100%);
    color: #ffffff;
    padding: 2rem;
  }

  .header {
    text-align: center;
    margin-bottom: 2rem;
  }

  h1 {
    font-size: clamp(2rem, 5vw, 3rem);
    font-weight: 800;
    margin: 0 0 0.5rem 0;
    background: linear-gradient(135deg, #00b8b8 0%, #00e5e5 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .subtitle {
    font-size: 1.1rem;
    color: #94a3b8;
    margin: 0;
  }

  .loading {
    text-align: center;
    padding: 4rem 2rem;
  }

  .loading p {
    font-size: 1.2rem;
    color: #cbd5e1;
    margin: 1rem 0;
  }

  .loading .hint {
    font-size: 0.9rem;
    color: #64748b;
  }

  .content {
    max-width: 1200px;
    margin: 0 auto;
  }

  .controls-panel {
    background: rgba(255, 255, 255, 0.05);
    border: 1.5px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 1.5rem;
    margin-bottom: 2rem;
  }

  .control-group {
    margin-bottom: 1.5rem;
  }

  .control-group:last-child {
    margin-bottom: 0;
  }

  .control-label {
    display: block;
    font-weight: 600;
    font-size: 0.9rem;
    color: #cbd5e1;
    margin-bottom: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .variant-buttons,
  .playback-buttons {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
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
    transform: translateY(-1px);
  }

  button.active {
    background: linear-gradient(135deg, #00b8b8 0%, #00e5e5 100%);
    border-color: transparent;
    color: #0f0f14;
  }

  .sequence-info {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 1rem;
    padding-top: 1rem;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  .info-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .info-item .label {
    font-size: 0.75rem;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .info-item .value {
    font-size: 1.1rem;
    font-weight: 600;
    color: #00e5e5;
  }

  .canvas-container {
    max-width: 600px;
    margin: 0 auto;
  }

  @media (max-width: 768px) {
    .variant-buttons button {
      font-size: 0.8rem;
      padding: 0.4rem 0.8rem;
    }
  }
</style>
