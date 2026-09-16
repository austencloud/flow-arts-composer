<!--
  Choo Choo Test Page

  Algorithmically generates Choo Choo sequences for validation.
  Navigate to /test/choo-choo to use.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import AnimatorCanvas from "$lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { getAnimationPlaybackController } from "$lib/shared/animation-engine/get-animation-playback-controller";

  import type { AnimationPlaybackController } from "$lib/shared/animation-engine/services/animation-playback-controller";
  import { motionQueryHandler } from "$lib/shared/pictograph/shared/services/motion-query-handler";
  import { createAnimationPanelState } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
  import {
    generateChooChoo,
    generateChooChooVariations,
    detectChooChoo,
    type ChooChooConfig,
    DEFAULT_CONFIG,
  } from "./choo-choo-generator";

  // Generated sequences
  let sequences = $state<SequenceData[]>([]);
  let selectedSequence = $state<SequenceData | null>(null);
  let selectedIndex = $state<number>(-1);

  // Configuration
  let config = $state<ChooChooConfig>({ ...DEFAULT_CONFIG });

  // Animation state
  let playbackController: AnimationPlaybackController | null = null;
  const animationState = createAnimationPanelState();
  let isPlaying = $state(false);
  let loading = $state(false);
  let servicesReady = $state(false);

  // Detection results
  let detectionResults = $state<Map<string, ReturnType<typeof detectChooChoo>>>(
    new Map()
  );

  onMount(() => {
    const init = async () => {
      loading = true;
      try {
        // ITI container is ready synchronously - get services directly
        playbackController = getAnimationPlaybackController();
        servicesReady = true;

        // Generate initial variations after services are ready
        await doGenerateVariations();
      } catch (err) {
        console.error("Failed to initialize services:", err);
      }
      loading = false;
    };
    init();

    return () => {
      animationState.dispose();
    };
  });

  async function doGenerateVariations() {
    sequences = await generateChooChooVariations(
      motionQueryHandler ?? undefined
    );

    // Run detection on each sequence
    const results = new Map<string, ReturnType<typeof detectChooChoo>>();
    for (const seq of sequences) {
      results.set(seq.id, detectChooChoo(seq));
    }
    detectionResults = results;
  }

  async function generateCustom() {
    const newSeq = await generateChooChoo(
      config,
      motionQueryHandler ?? undefined
    );
    sequences = [newSeq, ...sequences];
    detectionResults.set(newSeq.id, detectChooChoo(newSeq));
    selectSequence(0);
  }

  function selectSequence(index: number) {
    selectedIndex = index;
    selectedSequence = sequences[index] ?? null;

    if (selectedSequence && playbackController && servicesReady) {
      isPlaying = false;
      animationState.setIsPlaying(false);

      setTimeout(() => {
        playbackController!.initialize(selectedSequence!, animationState);
      }, 50);
    }
  }

  function togglePlayback() {
    if (!playbackController || !selectedSequence) return;
    isPlaying = !isPlaying;
    animationState.setIsPlaying(isPlaying);
    if (isPlaying) {
      animationState.setShouldLoop(true);
    }
  }

  function handleValidation(_seqId: string, _isValid: boolean) {
    // Could store this for training data later
  }

  // Current step data for animation
  let currentStepData = $derived.by(() => {
    if (!animationState.sequenceData) return null;
    const currentStep = animationState.currentStep;

    if (currentStep === 0 && animationState.sequenceData.startPlacement) {
      return animationState.sequenceData.startPlacement;
    }

    if (animationState.sequenceData.steps?.length) {
      const stepIndex = Math.max(0, Math.ceil(currentStep - 1) - 1);
      const clampedIndex = Math.min(
        stepIndex,
        animationState.sequenceData.steps.length - 1
      );
      return animationState.sequenceData.steps[clampedIndex] || null;
    }

    return null;
  });

  let currentLetter = $derived(currentStepData?.letter || null);
</script>

<div class="choo-choo-page">
  <header class="page-header">
    <h1>Choo Choo Generator</h1>
    <p>Algorithmically generated Choo Choo sequences for validation</p>
  </header>

  <div class="content">
    <!-- Configuration Panel -->
    <section class="config-panel">
      <h2>Generate Custom Choo Choo</h2>

      <div class="config-grid">
        <label class="config-item">
          <span>Static Prop</span>
          <select bind:value={config.staticProp}>
            <option value="blue">Left</option>
            <option value="red">Right</option>
          </select>
        </label>

        <label class="config-item">
          <span>Rotation Direction</span>
          <select bind:value={config.rotationDirection}>
            <option value="cw">Clockwise</option>
            <option value="ccw">Counter-Clockwise</option>
          </select>
        </label>

        <label class="config-item">
          <span>Orbit Direction</span>
          <select bind:value={config.orbitDirection}>
            <option value="cw">Clockwise</option>
            <option value="ccw">Counter-Clockwise</option>
          </select>
        </label>

        <label class="config-item">
          <span>Steps</span>
          <select bind:value={config.steps}>
            <option value={4}>4 (Full)</option>
            <option value={2}>2 (Half)</option>
          </select>
        </label>

        <label class="config-item">
          <span>Turns per Beat</span>
          <select bind:value={config.turnsPerBeat}>
            <option value={0.5}>0.5</option>
            <option value={1}>1</option>
            <option value={1.5}>1.5</option>
            <option value={2}>2</option>
          </select>
        </label>
      </div>

      <button
        class="generate-btn"
        onclick={() => generateCustom()}
        disabled={!servicesReady}
      >
        Generate Choo Choo
      </button>
    </section>

    <!-- Animation Preview -->
    <section class="preview-panel">
      <h2>Animation Preview</h2>

      {#if loading}
        <div class="loading">Loading animation services...</div>
      {:else if selectedSequence}
        <div class="animation-container">
          <AnimatorCanvas
            leftProp={animationState.leftPropState}
            rightProp={animationState.rightPropState}
            gridVisible={true}
            gridMode={animationState.sequenceData?.gridMode ?? null}
            letter={currentLetter}
            stepData={currentStepData}
            currentStep={animationState.currentStep}
            sequenceData={animationState.sequenceData}
          />
        </div>

        <div class="playback-controls">
          <button
            class="play-btn"
            onclick={togglePlayback}
            disabled={!servicesReady}
          >
            {isPlaying ? "Pause" : "Play"}
          </button>

          <span class="beat-indicator">
            Step: {Math.floor(animationState.currentStep)}
          </span>
        </div>

        <div class="sequence-info">
          <p><strong>Name:</strong> {selectedSequence.name}</p>
          <p><strong>Word:</strong> {selectedSequence.word}</p>
          <p><strong>Steps:</strong> {selectedSequence.steps.length}</p>
          <p><strong>Tags:</strong> {selectedSequence.tags.join(", ")}</p>
        </div>

        <div class="validation-buttons">
          <button
            class="valid-btn"
            onclick={() => handleValidation(selectedSequence!.id, true)}
          >
            Valid Choo Choo
          </button>
          <button
            class="invalid-btn"
            onclick={() => handleValidation(selectedSequence!.id, false)}
          >
            Not a Choo Choo
          </button>
        </div>
      {:else}
        <div class="empty">Select a sequence to preview</div>
      {/if}
    </section>

    <!-- Sequence List -->
    <section class="sequences-panel">
      <h2>Generated Sequences ({sequences.length})</h2>

      <div class="sequence-grid">
        {#each sequences as seq, i}
          {@const detection = detectionResults.get(seq.id)}
          <button
            class="sequence-card"
            class:selected={selectedIndex === i}
            onclick={() => selectSequence(i)}
          >
            <div class="card-header">
              <span class="seq-type">
                {detection?.type === "full"
                  ? "Full"
                  : detection?.type === "half"
                    ? "Half"
                    : "?"}
              </span>
              <span class="seq-steps">{seq.steps.length} steps</span>
            </div>
            <div class="card-word">{seq.word}</div>
            <div class="card-meta">
              {(seq.metadata as any)?.config?.staticProp} static,
              {(seq.metadata as any)?.config?.rotationDirection} rotation
            </div>
            {#if detection?.hasChooChoo}
              <div class="detection-badge valid">Detected</div>
            {:else}
              <div class="detection-badge invalid">Not Detected</div>
            {/if}
          </button>
        {/each}
      </div>

      <button
        class="regenerate-btn"
        onclick={() => doGenerateVariations()}
        disabled={!servicesReady}
      >
        Regenerate All Variations
      </button>
    </section>
  </div>
</div>

<style>
  .choo-choo-page {
    min-height: 100vh;
    background: var(--theme-panel-bg, #1a1a2e);
    color: var(--theme-text, #fff);
    padding: 1rem;
  }

  .page-header {
    text-align: center;
    margin-bottom: 2rem;
  }

  .page-header h1 {
    font-size: 2rem;
    margin: 0 0 0.5rem;
    background: linear-gradient(135deg, #ec4899, #8b5cf6);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .page-header p {
    color: var(--theme-text-dim, #888);
    margin: 0;
  }

  .content {
    display: grid;
    grid-template-columns: 300px 1fr 350px;
    gap: 1.5rem;
    max-width: 1600px;
    margin: 0 auto;
  }

  @media (max-width: 1200px) {
    .content {
      grid-template-columns: 1fr;
    }
  }

  section {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border-radius: 12px;
    padding: 1.5rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  h2 {
    font-size: 1.25rem;
    margin: 0 0 1rem;
    color: var(--theme-text, #fff);
  }

  /* Config Panel */
  .config-grid {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .config-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .config-item span {
    font-size: 0.875rem;
    color: var(--theme-text-dim, #888);
  }

  .config-item select {
    padding: 0.5rem;
    border-radius: 6px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.2));
    background: var(--theme-input-bg, rgba(0, 0, 0, 0.3));
    color: var(--theme-text, #fff);
    font-size: 1rem;
  }

  .generate-btn {
    margin-top: 1rem;
    padding: 0.75rem 1.5rem;
    background: linear-gradient(135deg, #ec4899, #8b5cf6);
    border: none;
    border-radius: 8px;
    color: white;
    font-weight: 600;
    cursor: pointer;
    transition:
      transform 0.2s,
      box-shadow 0.2s;
  }

  .generate-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 20px rgba(236, 72, 153, 0.4);
  }

  /* Preview Panel */
  .preview-panel {
    display: flex;
    flex-direction: column;
  }

  .animation-container {
    aspect-ratio: 1;
    max-height: 400px;
    background: #0a0a14;
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 1rem;
  }

  .playback-controls {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .play-btn {
    padding: 0.5rem 2rem;
    background: var(--theme-accent, #8b5cf6);
    border: none;
    border-radius: 6px;
    color: white;
    font-weight: 600;
    cursor: pointer;
  }

  .play-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .beat-indicator {
    color: var(--theme-text-dim, #888);
  }

  .sequence-info {
    padding: 1rem;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 6px;
    margin-bottom: 1rem;
  }

  .sequence-info p {
    margin: 0.25rem 0;
    font-size: 0.875rem;
  }

  .validation-buttons {
    display: flex;
    gap: 1rem;
  }

  .valid-btn,
  .invalid-btn {
    flex: 1;
    padding: 0.75rem;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
  }

  .valid-btn {
    background: #22c55e;
    color: white;
  }

  .invalid-btn {
    background: #ef4444;
    color: white;
  }

  .loading,
  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 200px;
    color: var(--theme-text-dim, #888);
  }

  /* Sequences Panel */
  .sequence-grid {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    max-height: 500px;
    overflow-y: auto;
  }

  .sequence-card {
    padding: 1rem;
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    transition: all var(--duration-normal);
    color: var(--theme-text, #fff);
  }

  .sequence-card:hover {
    border-color: var(--theme-accent, #8b5cf6);
  }

  .sequence-card.selected {
    border-color: var(--theme-accent, #8b5cf6);
    background: rgba(139, 92, 246, 0.1);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }

  .seq-type {
    font-weight: 600;
    color: #ec4899;
  }

  .seq-steps {
    color: var(--theme-text-dim, #888);
    font-size: 0.875rem;
  }

  .card-word {
    font-size: 1.5rem;
    font-weight: 700;
    margin-bottom: 0.25rem;
  }

  .card-meta {
    font-size: 0.75rem;
    color: var(--theme-text-dim, #888);
    margin-bottom: 0.5rem;
  }

  .detection-badge {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .detection-badge.valid {
    background: rgba(34, 197, 94, 0.2);
    color: #22c55e;
  }

  .detection-badge.invalid {
    background: rgba(239, 68, 68, 0.2);
    color: #ef4444;
  }

  .regenerate-btn {
    margin-top: 1rem;
    padding: 0.5rem 1rem;
    background: transparent;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.2));
    border-radius: 6px;
    color: var(--theme-text, #fff);
    cursor: pointer;
    width: 100%;
  }

  .regenerate-btn:hover {
    border-color: var(--theme-accent, #8b5cf6);
  }
</style>
