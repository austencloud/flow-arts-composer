<!--
  PhraseEffortLabModule.svelte

  Orchestrator for the Phrase Effort Lab. Lets the user pick a sequence,
  paint effort phrases onto a beat timeline, preview the result with
  phrase-based easing in an AnimatorCanvas, and save the effort timeline
  back to the sequence.

  Layout:
    [Header + Sequence Picker + Save]
    [AnimatorCanvas preview]
    [EffortPalette brush selector]
    [PhraseTimeline - paint phrases]
    [Transition toggle: Hard | Blend]
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { EffortId } from "#lib/shared/effort/domain/effort-types.js";
  import type {
    EffortTimeline,
    EffortPhrase,
  } from "./domain/effort-timeline-types";
  import { findPhraseAtBeat } from "./domain/effort-timeline-types";
  import { interpolatePhrase } from "#lib/shared/phrase-effort-lab/services/phrase-interpolator.js";

  import { interpolatePropAngles } from "#lib/shared/animation-engine/services/prop-interpolator.js";
  import { mapTimePositionToBeat } from "#lib/shared/animation-engine/services/step-calculator.js";
  import { isVisibleMotion } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";

  import { getAnimationVisibilityManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
  import { doc, setDoc, serverTimestamp } from "firebase/firestore";
  import { getFirestoreInstance, getAuthSync } from "#lib/shared/auth/firebase.js";
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";

  import AnimatorCanvas from "#lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import SequencePickerModal from "#lib/shared/components/sequence-picker/SequencePickerModal.svelte";
  import EffortPalette from "#lib/shared/phrase-effort-lab/components/EffortPalette.svelte";
  import PhraseTimeline from "./components/PhraseTimeline.svelte";
  import PhraseEasingCurveOverlay from "./components/PhraseEasingCurveOverlay.svelte";
  import TransportControls from "#lib/shared/animation-engine/components/controls/TransportControls.svelte";
  import TempoControl from "#lib/shared/animation-panel/components/TempoControl.svelte";
  import { libraryState } from "#lib/features/library/state/library-state.svelte.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { settingsService } from "#lib/shared/settings/state/settings-state.svelte.js";
  import { createPhraseEffortLabState } from "./state/phrase-effort-lab-state.svelte";

  // ─── Reactive UI state (factory + context pattern) ────────────────────
  const lab = createPhraseEffortLabState();

  // ─── Services ready flag (set in onMount) ────────────────────────────
  let servicesReady = false;

  const visibilityManager = getAnimationVisibilityManager();

  // ─── Library load tracking (distinguish loading from empty) ───────────
  // True while we've asked the library to load but it hasn't populated yet.
  let awaitingLibraryLoad = $state(false);
  let isLibraryLoading = $derived(
    !lab.sequence && (awaitingLibraryLoad || libraryState.isLoading)
  );

  function handleKeydown(e: KeyboardEvent) {
    if ((e.key === "Delete" || e.key === "Backspace") && lab.selectedPhraseId) {
      e.preventDefault();
      handleDeleteSelected();
    }
    if (e.key === " " && lab.sequence) {
      e.preventDefault();
      togglePlayback();
    }
  }

  let hasRestored = false;

  function tryRestoreSession(): boolean {
    if (hasRestored || lab.sequence) return false;
    if (libraryState.sequences.length === 0) return false;

    const savedId = lab.getPersistedSequenceId();
    if (!savedId) return false;

    // getSequenceById returns LibrarySequence, a structural superset of
    // SequenceData — assignable directly, no cast needed.
    const saved = libraryState.getSequenceById(savedId);
    if (!saved) return false;

    hasRestored = true;
    awaitingLibraryLoad = false;
    handleSequenceSelected(saved);

    // Restore persisted timeline (overrides what's on the sequence)
    lab.tryRestoreTimeline();
    return true;
  }

  onMount(() => {
    servicesReady = true;

    document.addEventListener("keydown", handleKeydown);
    lab.rafId = requestAnimationFrame(onFrame);

    // Seed playback tempo from the shared animation tempo.
    lab.setBpm(visibilityManager.getBpm());

    // If we have a saved session but library isn't loaded yet, trigger load
    const savedId = lab.getPersistedSequenceId();
    if (savedId && libraryState.sequences.length === 0) {
      awaitingLibraryLoad = true;
      libraryState.loadSequences();
    }

    // Restore immediately if library is already loaded (HMR / tab re-entry)
    tryRestoreSession();
  });

  // Restore when library loads asynchronously (after loadSequences completes)
  $effect(() => {
    if (hasRestored || lab.sequence) return;
    // Read reactively so effect re-runs when library populates
    const seqs = libraryState.sequences;
    if (seqs.length === 0) return;
    awaitingLibraryLoad = false;
    tryRestoreSession();
  });

  onDestroy(() => {
    document.removeEventListener("keydown", handleKeydown);
    if (lab.rafId !== null) {
      cancelAnimationFrame(lab.rafId);
      lab.rafId = null;
    }
  });

  function onFrame(timestamp: number) {
    if (!lab.isPlaying || lab.steps.length === 0) {
      lab.lastTime = null;
      lab.rafId = requestAnimationFrame(onFrame);
      return;
    }

    if (lab.lastTime === null) {
      lab.lastTime = timestamp;
      lab.rafId = requestAnimationFrame(onFrame);
      return;
    }

    const deltaMs = timestamp - lab.lastTime;
    lab.lastTime = timestamp;

    const beatsPerMs = lab.bpm / 60000;
    lab.playbackBeat += deltaMs * beatsPerMs;

    if (lab.playbackBeat >= lab.totalSteps) {
      lab.playbackBeat = lab.playbackBeat % lab.totalSteps;
    }

    updatePropStates();
    lab.rafId = requestAnimationFrame(onFrame);
  }


  /**
   * Find the next phrase after the given beat, for blend crossfade.
   */
  function findNextPhrase(beat: number): EffortPhrase | null {
    for (const phrase of lab.timeline.phrases) {
      if (phrase.startStep > beat) return phrase;
    }
    return null;
  }

  function updatePropStates() {
    const steps = lab.steps;
    const timeline = lab.timeline;
    if (!servicesReady || steps.length === 0) return;

    const beat1Based = lab.playbackBeat + 1;
    const activePhrase = findPhraseAtBeat(timeline, beat1Based);

    let stepIndex: number;
    let localProgress: number;

    if (activePhrase) {
      const result = interpolatePhrase(activePhrase, beat1Based, steps.length);
      stepIndex = result.stepIndex;
      localProgress = result.localProgress;

      // ── Blend mode: crossfade near phrase boundaries ──
      if (timeline.transition === "blend" && timeline.blendSteps) {
        const halfBlend = (timeline.blendSteps ?? 1) / 2;

        // Check if we're near the END of this phrase (approaching next phrase)
        const phraseEnd = activePhrase.endStep + 1; // exclusive end
        const distToEnd = phraseEnd - beat1Based;
        const nextPhrase =
          distToEnd <= halfBlend ? findNextPhrase(beat1Based) : null;

        if (nextPhrase && distToEnd > 0) {
          // Blend: lerp between current phrase result and next phrase result
          const blendT = 1 - distToEnd / halfBlend; // 0 at blend start → 1 at boundary
          const nextResult = interpolatePhrase(
            nextPhrase,
            beat1Based,
            steps.length
          );
          // Lerp step positions
          const posA = stepIndex + localProgress;
          const posB = nextResult.stepIndex + nextResult.localProgress;
          const blended = posA + (posB - posA) * blendT;
          stepIndex = Math.min(Math.floor(blended), steps.length - 1);
          localProgress = blended - Math.floor(blended);
        }

        // Check if we're near the START of this phrase (coming from previous)
        const distFromStart = beat1Based - activePhrase.startStep;
        if (distFromStart < halfBlend && timeline.phrases.length > 0) {
          // Find previous phrase
          let prevPhrase: EffortPhrase | null = null;
          for (const p of timeline.phrases) {
            if (p.endStep + 1 <= activePhrase.startStep) prevPhrase = p;
            else break;
          }
          if (prevPhrase) {
            const blendT = distFromStart / halfBlend; // 0 at boundary → 1 at blend end
            const prevResult = interpolatePhrase(
              prevPhrase,
              beat1Based,
              steps.length
            );
            const posA = prevResult.stepIndex + prevResult.localProgress;
            const posB = stepIndex + localProgress;
            const blended = posA + (posB - posA) * blendT;
            stepIndex = Math.min(Math.floor(blended), steps.length - 1);
            localProgress = blended - Math.floor(blended);
          }
        }
      }
    } else {
      // No phrase covering this beat - use linear playback
      const mapped = mapTimePositionToBeat(lab.playbackBeat, steps);
      stepIndex = mapped.stepIndex;
      localProgress = mapped.stepProgress;
    }

    const stepData = steps[stepIndex];
    // Blank beats (both hands invisible placeholders since the 2026-07-02
    // both-required flip) freeze the lab state — same as when the motions
    // were absent outright (Wave 0 straggler fix: dead presence gate).
    if (
      !isVisibleMotion(stepData?.motions?.left) &&
      !isVisibleMotion(stepData?.motions?.right)
    )
      return;

    lab.currentStepData = stepData;
    lab.currentStep = stepIndex + 1;
    lab.currentLetter = stepData?.letter ?? null;

    const result = interpolatePropAngles(stepData!, localProgress);
    if (result.isValid) {
      lab.leftProp = result.leftAngles ?? { ...lab.DEFAULT_PROP_STATE };
      lab.rightProp = result.rightAngles ?? { ...lab.DEFAULT_PROP_STATE };
    }
  }

  function handleSequenceSelected(seq: SequenceData) {
    awaitingLibraryLoad = false;
    lab.loadSequence(seq);

    // Compute initial prop states
    if (lab.steps.length > 0) {
      updatePropStates();
    }
  }

  function togglePlayback() {
    lab.togglePlayback();
  }

  function handleBpmChange(newBpm: number) {
    lab.setBpm(newBpm);
  }

  function handleTimelineChange(updated: EffortTimeline) {
    lab.updateTimeline(updated);
  }

  function handlePhraseSelect(id: string | null) {
    lab.selectPhrase(id);
  }

  function handleTransitionToggle() {
    lab.toggleTransition();
  }

  function handleRestart() {
    lab.restart();
    updatePropStates();
  }

  function handleDeleteSelected() {
    lab.deleteSelected();
  }

  function handleClearTimeline() {
    lab.clearTimeline();
  }

  /** 4x4 preset: divide beats into 4 equal sections, assign efforts */
  const PRESET_4X4_COMBOS: {
    label: string;
    efforts: [EffortId, EffortId, EffortId, EffortId];
  }[] = [
    { label: "Laban Cycle", efforts: ["glide", "dab", "press", "punch"] },
    { label: "Build Up", efforts: ["glide", "press", "dab", "punch"] },
    { label: "Wave", efforts: ["press", "glide", "press", "glide"] },
    { label: "Contrast", efforts: ["punch", "glide", "punch", "glide"] },
  ];

  function applyPreset4x4(efforts: [EffortId, EffortId, EffortId, EffortId]) {
    lab.applyPreset4x4(efforts);
  }

  async function handleSave() {
    const sequence = lab.sequence;
    if (!sequence?.id || lab.saving) return;

    const user = getAuthSync().currentUser;
    if (!user) {
      toast.error("Sign in to save effort timelines.");
      return;
    }

    lab.saving = true;
    try {
      const firestore = await getFirestoreInstance();
      const sequenceRef = doc(
        firestore,
        `users/${user.uid}/sequences/${sequence.id}`
      );
      // JSON round-trip strips Svelte $state proxies - Firestore rejects them
      // and structuredClone can't handle proxy Symbols either.
      const plainTimeline = JSON.parse(JSON.stringify(lab.timeline));
      const propConfig = sequence.creatorIntent?.propConfig
        ? JSON.parse(JSON.stringify(sequence.creatorIntent.propConfig))
        : {
            leftPropType: (settingsService.settings.leftPropType ||
              PropType.STAFF) as PropType,
            rightPropType: (settingsService.settings.rightPropType ||
              PropType.STAFF) as PropType,
            catDogMode: settingsService.settings.catDogMode ?? false,
          };
      const updatedIntent = {
        propConfig,
        effortTimeline: plainTimeline,
      };

      await setDoc(
        sequenceRef,
        {
          effortTimeline: plainTimeline,
          creatorIntent: updatedIntent,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      lab.sequence = {
        ...sequence,
        effortTimeline: lab.timeline,
        creatorIntent: updatedIntent,
      };
      lab.saveStatus = "saved";
      toast.success("Effort timeline saved.");
    } catch (err) {
      console.error("PhraseEffortLab: failed to save effort timeline:", err);
      lab.saveStatus = "error";
      toast.error("Failed to save effort timeline.");
    } finally {
      lab.saving = false;
    }
  }
</script>

<div class="phrase-effort-lab">
  <!-- Header bar -->
  <header class="lab-header">
    <div class="header-left">
      <h2 class="lab-title">Phrase Effort Lab</h2>
      <span class="experiment-badge">Experimental</span>
    </div>

    <div class="header-right">
      <button
        class="pick-btn"
        onclick={() => (lab.showPicker = true)}
        type="button"
      >
        <i class="fas fa-search" aria-hidden="true"></i>
        {lab.sequence ? lab.sequenceWord || "Sequence" : "Pick Sequence"}
      </button>

      {#if lab.sequence}
        <button
          class="save-btn"
          class:saved={lab.saveStatus === "saved"}
          class:error={lab.saveStatus === "error"}
          onclick={handleSave}
          disabled={lab.saving || lab.timeline.phrases.length === 0}
          type="button"
        >
          {#if lab.saving}
            <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
          {:else if lab.saveStatus === "saved"}
            <i class="fas fa-check" aria-hidden="true"></i>
          {:else if lab.saveStatus === "error"}
            <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
          {:else}
            <i class="fas fa-save" aria-hidden="true"></i>
          {/if}
          Save
        </button>
      {/if}
    </div>
  </header>

  {#if !lab.sequence}
    {#if isLibraryLoading}
      <!-- Loading state: library is fetching a saved session -->
      <div class="empty-state" aria-live="polite" aria-busy="true">
        <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
        <p>Loading your library…</p>
      </div>
    {:else}
      <!-- Empty state -->
      <div class="empty-state">
        <i class="fas fa-paint-brush" aria-hidden="true"></i>
        <p>Pick a sequence to paint effort phrases</p>
        <button
          class="pick-cta"
          onclick={() => (lab.showPicker = true)}
          type="button"
        >
          Choose Sequence
        </button>
      </div>
    {/if}
  {:else}
    <!-- Canvas preview area -->
    <div class="canvas-area">
      <AnimatorCanvas
        leftProp={lab.leftProp}
        rightProp={lab.rightProp}
        gridMode={lab.gridMode}
        letter={lab.currentLetter}
        stepData={lab.currentStepData}
        sequenceData={lab.sequence}
        currentStep={lab.currentStep}
        isPlaying={lab.isPlaying}
        word={lab.sequenceWord}
        disableContextMenu={false}
        fireConfig={{ disableFrameCache: true }}
      />
    </div>

    <!-- Transport controls -->
    <div class="transport-bar">
      <TempoControl
        bpm={lab.bpm}
        onBpmChange={handleBpmChange}
        showPresets={false}
        showPractice={false}
      />
      <button
        class="restart-btn"
        onclick={handleRestart}
        type="button"
        aria-label="Restart from beginning"
        title="Restart"
      >
        <i class="fas fa-undo" aria-hidden="true"></i>
      </button>
      <TransportControls
        isPlaying={lab.isPlaying}
        onPlaybackToggle={togglePlayback}
      />
    </div>

    <!-- Effort palette -->
    <div class="palette-section">
      <EffortPalette
        selectedEffort={lab.selectedEffort}
        onSelect={(effort) => {
          lab.selectedEffort = effort;
        }}
      />
    </div>

    <!-- Timeline -->
    <div class="timeline-section">
      <div class="timeline-actions">
        <!-- Preset menu -->
        <div class="preset-wrapper">
          <button
            class="action-btn preset-btn"
            onclick={() => (lab.showPresetMenu = !lab.showPresetMenu)}
            type="button"
            disabled={lab.totalSteps < 4}
          >
            <i class="fas fa-magic" aria-hidden="true"></i>
            4×4 Preset
          </button>
          {#if lab.showPresetMenu}
            <div class="preset-menu">
              {#each PRESET_4X4_COMBOS as combo}
                <button
                  class="preset-option"
                  onclick={() => applyPreset4x4(combo.efforts)}
                  type="button"
                >
                  <span class="preset-option-label">{combo.label}</span>
                  <span class="preset-option-efforts">
                    {combo.efforts.join(" → ")}
                  </span>
                </button>
              {/each}
            </div>
          {/if}
        </div>

        {#if lab.selectedPhraseId}
          <button
            class="action-btn delete-btn"
            onclick={handleDeleteSelected}
            type="button"
          >
            <i class="fas fa-trash-alt" aria-hidden="true"></i>
            Delete
          </button>
        {/if}
        {#if lab.timeline.phrases.length > 0}
          <button
            class="action-btn clear-btn"
            onclick={handleClearTimeline}
            type="button"
          >
            <i class="fas fa-eraser" aria-hidden="true"></i>
            Clear All
          </button>
        {/if}
      </div>

      <PhraseTimeline
        timeline={lab.timeline}
        totalSteps={lab.totalSteps}
        selectedEffort={lab.selectedEffort}
        selectedPhraseId={lab.selectedPhraseId}
        onTimelineChange={handleTimelineChange}
        onPhraseSelect={handlePhraseSelect}
        currentStep={lab.currentStepForTimeline}
      />

      {#if lab.timeline.phrases.length > 0}
        <PhraseEasingCurveOverlay
          timeline={lab.timeline}
          totalSteps={lab.totalSteps}
        />
      {/if}
    </div>

    <!-- Transition toggle -->
    <div class="transition-bar">
      <span class="transition-label">Transition:</span>
      <div
        class="transition-toggle"
        role="radiogroup"
        aria-label="Transition mode"
      >
        <button
          class="toggle-btn"
          class:active={lab.timeline.transition === "hard"}
          type="button"
          role="radio"
          aria-checked={lab.timeline.transition === "hard"}
          onclick={handleTransitionToggle}
        >
          Hard
        </button>
        <button
          class="toggle-btn"
          class:active={lab.timeline.transition === "blend"}
          type="button"
          role="radio"
          aria-checked={lab.timeline.transition === "blend"}
          onclick={handleTransitionToggle}
        >
          Blend
        </button>
      </div>
    </div>
  {/if}
</div>

<!-- Sequence Picker Modal -->
<SequencePickerModal
  open={lab.showPicker}
  onSelect={handleSequenceSelected}
  onClose={() => (lab.showPicker = false)}
  title="Select Sequence for Phrase Effort Lab"
/>

<style>
  .phrase-effort-lab {
    /* Scoped accent palette — one source of truth for the lab's purple.
       Falls back to the global theme accent when present. */
    --phrase-accent: var(--theme-accent, #8b5cf6);
    --phrase-accent-text: #a78bfa;
    --phrase-accent-text-strong: #c4b5fd;

    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
  }


  .lab-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--spacing-sm, 8px);
    padding: var(--spacing-sm, 8px) var(--spacing-md, 16px);
    flex-shrink: 0;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm, 8px);
  }

  .lab-title {
    font-size: var(--font-size-lg, 18px);
    font-weight: 600;
    color: var(--theme-text, #ffffff);
    margin: 0;
  }

  .experiment-badge {
    font-size: var(--font-size-xs, 10px);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 2px 8px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--phrase-accent) 20%, transparent);
    color: var(--phrase-accent-text);
    border: 1px solid color-mix(in srgb, var(--phrase-accent) 30%, transparent);
  }


  .pick-btn,
  .save-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    border-radius: 8px;
    cursor: pointer;
    transition: all var(--duration-fast, 100ms) ease;
    min-height: var(--min-touch-target, 44px);
    -webkit-tap-highlight-color: transparent;
  }

  .pick-btn {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text, #ffffff);
  }

  .pick-btn:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    background: rgba(255, 255, 255, 0.06);
  }

  .save-btn {
    background: color-mix(in srgb, var(--phrase-accent) 15%, transparent);
    border: 1.5px solid
      color-mix(in srgb, var(--phrase-accent) 30%, transparent);
    color: var(--phrase-accent-text);
  }

  .save-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--phrase-accent) 25%, transparent);
    border-color: color-mix(in srgb, var(--phrase-accent) 50%, transparent);
  }

  .save-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .save-btn.saved {
    background: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 15%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 30%,
      transparent
    );
    color: color-mix(in srgb, var(--semantic-success, #22c55e) 70%, white);
  }

  .save-btn.error {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 15%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 30%,
      transparent
    );
    color: color-mix(in srgb, var(--semantic-error, #ef4444) 70%, white);
  }


  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-md, 16px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .empty-state i {
    font-size: 3rem;
    opacity: 0.4;
  }

  .empty-state p {
    font-size: var(--font-size-min, 14px);
    margin: 0;
  }

  .pick-cta {
    padding: 10px 24px;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    border-radius: 10px;
    background: color-mix(in srgb, var(--phrase-accent) 20%, transparent);
    border: 1.5px solid
      color-mix(in srgb, var(--phrase-accent) 40%, transparent);
    color: var(--phrase-accent-text);
    cursor: pointer;
    transition: all var(--duration-fast, 100ms) ease;
    min-height: var(--min-touch-target, 44px);
  }

  .pick-cta:hover {
    background: color-mix(in srgb, var(--phrase-accent) 30%, transparent);
    border-color: color-mix(in srgb, var(--phrase-accent) 60%, transparent);
  }


  .canvas-area {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }


  .transport-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-md, 16px);
    padding: var(--spacing-xs, 4px) var(--spacing-md, 16px);
    flex-shrink: 0;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }


  .palette-section {
    padding: var(--spacing-sm, 8px) var(--spacing-md, 16px);
    flex-shrink: 0;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }


  .timeline-section {
    padding: var(--spacing-sm, 8px) var(--spacing-md, 16px);
    flex-shrink: 0;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .timeline-actions {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm, 8px);
    margin-bottom: var(--spacing-xs, 4px);
    min-height: 28px;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    border-radius: 6px;
    background: transparent;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    cursor: pointer;
    transition: all var(--duration-fast, 100ms) ease;
  }

  .action-btn:hover {
    color: var(--theme-text, #ffffff);
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .action-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .delete-btn:hover {
    color: color-mix(in srgb, var(--semantic-error, #ef4444) 70%, white);
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 30%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 10%,
      transparent
    );
  }


  .restart-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    cursor: pointer;
    transition: all var(--duration-fast, 100ms) ease;
    font-size: var(--font-size-compact, 12px);
  }

  .restart-btn:hover {
    color: var(--theme-text, white);
    border-color: var(--phrase-accent);
    background: color-mix(in srgb, var(--phrase-accent) 15%, transparent);
  }


  .preset-wrapper {
    position: relative;
  }

  .preset-btn {
    background: color-mix(in srgb, var(--phrase-accent) 10%, transparent);
    border-color: color-mix(in srgb, var(--phrase-accent) 25%, transparent);
    color: var(--phrase-accent-text);
  }

  .preset-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--phrase-accent) 20%, transparent);
    border-color: color-mix(in srgb, var(--phrase-accent) 40%, transparent);
    color: var(--phrase-accent-text-strong);
  }

  .preset-menu {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 0;
    min-width: 200px;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
    border-radius: 10px;
    padding: 4px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    z-index: 10;
  }

  .preset-option {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    padding: 8px 12px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--theme-text, white);
    cursor: pointer;
    text-align: left;
    transition: background var(--duration-fast, 100ms) ease;
  }

  .preset-option:hover {
    background: color-mix(in srgb, var(--phrase-accent) 15%, transparent);
  }

  .preset-option-label {
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
  }

  .preset-option-efforts {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    text-transform: capitalize;
  }


  .transition-bar {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm, 8px);
    padding: var(--spacing-sm, 8px) var(--spacing-md, 16px);
    flex-shrink: 0;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .transition-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .transition-toggle {
    display: flex;
    gap: 2px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    padding: 2px;
  }

  .toggle-btn {
    padding: 6px 14px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    cursor: pointer;
    transition: all var(--duration-fast, 100ms) ease;
    min-height: var(--min-touch-target, 44px);
    -webkit-tap-highlight-color: transparent;
  }

  .toggle-btn.active {
    background: color-mix(in srgb, var(--phrase-accent) 20%, transparent);
    color: var(--theme-text, #ffffff);
  }

  .toggle-btn:hover:not(.active) {
    color: var(--theme-text, #ffffff);
    background: rgba(255, 255, 255, 0.04);
  }


  @media (prefers-reduced-motion: reduce) {
    .pick-btn,
    .save-btn,
    .pick-cta,
    .action-btn,
    .toggle-btn,
    .restart-btn,
    .preset-option {
      transition: none;
    }
  }
</style>
