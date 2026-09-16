<!--
SpellPanel.svelte - Word-to-Sequence Generation Panel (Container-Aware)

Adapts to available space:
- Tall viewport: Full accordion layout
- Constrained viewport: Horizontal chip bar with bottom sheet

Uses container queries to detect available height and switch layouts.
Same functionality, different density.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import type { SequenceState } from "$lib/features/create/shared/state/sequence-state-orchestrator.svelte";
  import type { SpellTabState } from "../state/spell-tab-state.svelte";
import { getDeviceDetector } from "$lib/shared/device/get-device-detector";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import type { VariationExplorationOrchestrator } from "../services/variation-exploration-orchestrator";
  import type { RandomSequenceGenerator } from "../services/random-sequence-generator";
  import * as spellServiceLoaderModule from "../services/spell-service-loader";
  import { startPlacementDeriver } from "$lib/shared/pictograph/shared/services/start-placement-deriver";
  import type { DeviceDetector } from '$lib/shared/device/services/device-detector'
  import { UndoOperationType } from "../../shared/services/undo-manager";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import WordInput from "./WordInput.svelte";
  import SpellSettingsBar from "./SpellSettingsBar.svelte";
  import SpellInputToolbar from "./SpellInputToolbar.svelte";
  import { loadSpellState, saveSpellState } from "../state/spell-persistence.svelte";
  import { createConstraintSet } from "$lib/shared/sequence-engine/constraints";
  import { tryGetCreateModuleContext } from "$lib/features/create/shared/context/create-module-context";
  import { getVariationExplorationOrchestrator as getVariationExplorationOrchestratorGetter } from "$lib/features/create/spell/get-variation-exploration-orchestrator";

  // Props
  let {
    spellState,
    sequenceState,
    isDesktop = false,
  }: {
    spellState: SpellTabState;
    sequenceState: SequenceState | null;
    isDesktop?: boolean;
  } = $props();

  // Touch device and input focus tracking
  const deviceDetector = getDeviceDetector();
  const haptic = getHapticFeedback();
  let hasTouchCapability = $state(false);
  let isInputFocused = $state(false);

  // Loop chip expansion: simple boolean, animation handled by CSS transition-delay
  let isLoopExpanded = $state(false);

  // Keyboard state
  let hasVirtualKeyboard = $state(false);

  // Panel element ref for potential future use
  let panelElement: HTMLElement | null = $state(null);

  // The toolbar is 60px fixed height. When keyboard is open, we need to reserve
  // space for the toolbar since it sits above the keyboard.
  // Should we show the collapsed input-only layout?
  // Collapse when virtual keyboard is visible and input is focused.
  // Previously this also checked `availableHeight < threshold`, but that caused
  // an infinite oscillation: collapse hides workspace → tool panel gets more height
  // → availableHeight exceeds threshold → uncollapse → workspace shows → tool panel
  // shrinks → availableHeight drops → collapse again → infinite loop.
  // The `hasVirtualKeyboard` check already ensures this only fires on real mobile
  // devices with actual virtual keyboards, so the height check is unnecessary.
  const shouldCollapseLayout = $derived(
    isInputFocused && hasVirtualKeyboard
  );

  // Legacy name for backwards compatibility with parent layout notification
  const isInputMode = $derived(shouldCollapseLayout);

  const createModuleContext = tryGetCreateModuleContext();

  // Notify parent layout when input mode changes
  $effect(() => {
    createModuleContext?.layout?.setInputMode(isInputMode);
  });

  // Lazy-resolved services
  let orchestrator: VariationExplorationOrchestrator | null = null;
  let randomGenerator: RandomSequenceGenerator | null = null;

  function getOrchestrator(): VariationExplorationOrchestrator {
    if (!orchestrator) {
      orchestrator = getVariationExplorationOrchestratorGetter();
    }
    return orchestrator;
  }

  async function getRandomGenerator(): Promise<RandomSequenceGenerator> {
    if (!randomGenerator) {
      randomGenerator = await spellServiceLoaderModule.getRandomSequenceGenerator();
    }
    return randomGenerator;
  }

  onMount(() => {
    hasTouchCapability = deviceDetector.isTouchDevice();

    const persisted = loadSpellState();
    if (persisted.inputWord) {
      spellState.setInputWord(persisted.inputWord);
    }
    if (persisted.expandedWord) {
      spellState.setExpandedWord(persisted.expandedWord);
    }
    // Restore the rest of what the save $effect persists. Without this,
    // preferences reset to defaults on every reload despite being saved.
    if (persisted.preferences) {
      spellState.setPreferences(persisted.preferences);
    }
    if (persisted.hasGeneratedOnce) {
      spellState.markHasGeneratedOnce();
    }
  });

  function handleInputFocusChange(focused: boolean) {
    isInputFocused = focused;
  }

  function handleToolbarDone() {
    isInputFocused = false;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }

  function handleKeyboardHeightChange(height: number) {
    // Track keyboard visibility for smart layout decisions
    // Note: we only care IF keyboard is visible, not exact height
    // (container height already shrinks when keyboard opens)
    hasVirtualKeyboard = height > 0;
  }

  // Auto-save state when it changes
  $effect(() => {
    const word = spellState.inputWord;
    const expanded = spellState.expandedWord;
    const prefs = spellState.preferences;
    const hasGenerated = spellState.hasGeneratedOnce;

    saveSpellState({
      inputWord: word,
      expandedWord: expanded,
      preferences: prefs,
      hasGeneratedOnce: hasGenerated,
    });
  });

  // Derived
  const canGenerate = $derived(spellState.inputWord.trim().length > 0 && !spellState.isGenerating);


  function deriveStartPlacement(sequence: SequenceData): SequenceData {
    if (sequence.startPlacement || !sequence.steps?.length) {
      return sequence;
    }

    const firstStep = sequence.steps[0];
    if (!firstStep) return sequence;

    try {
    const derivedStartPlacement = startPlacementDeriver.deriveFromFirstStep(firstStep);
      return {
        ...sequence,
        startPlacement: derivedStartPlacement,
      };
    } catch (error) {
      console.warn("Failed to derive start placement:", error);
      return sequence;
    }
  }


  function handleWordChange(value: string) {
    spellState.setInputWord(value);
  }

  function handleGridModeChange(mode: GridMode) {
    spellState.setGridMode(mode);
  }

  function handlePreferenceChange<K extends keyof typeof spellState.preferences>(
    key: K,
    value: (typeof spellState.preferences)[K]
  ) {
    spellState.updatePreference(key, value);
  }

  async function handleGenerate() {
    if (!spellState.inputWord.trim() || !sequenceState) return;

    haptic.trigger("selection");
    spellState.setGenerating(true);
    spellState.clearError();

    try {
      const orch = getOrchestrator();
      const generator = await getRandomGenerator();

      // Parse word WITH bridge letters (pass preferences for dash preference)
      const parseResult = await orch.parseWord(spellState.inputWord, {
        preferences: spellState.preferences,
      });
      if (!parseResult.success || !parseResult.expandedLetters) {
        haptic.trigger("error");
        spellState.setError(parseResult.error || "Could not parse word");
        return;
      }

      const letters = parseResult.expandedLetters;
      spellState.setExpandedWord(parseResult.expandedWord || spellState.inputWord);

      if (parseResult.letterSources) {
        spellState.setLetterSources(parseResult.letterSources);
      }

      const constraintBuilder = await spellServiceLoaderModule.getVariationConstraintBuilder();
      const constraints = constraintBuilder.buildConstraints(
        spellState.preferences,
        letters
      );

      const constraintSet = createConstraintSet(spellState.preferences.constraintPreset, {
        handPathMode: spellState.preferences.handPathMode,
      });

      // Generate sequence
      const sequence = await generator.generateRandomSequence(
        letters,
        {
          gridMode: spellState.selectedGridMode,
          constraints,
          constraintSet,
          letterSources: parseResult.letterSources,
        }
      );

      if (!sequence) {
        haptic.trigger("error");
        spellState.setError("Could not generate a valid sequence. Try different settings.");
        return;
      }

      const sequenceWithStart = deriveStartPlacement(sequence);

      // Check if LOOP was applied (sequence has extended data in metadata)
      const loopSpellData = sequenceWithStart.metadata?.spellData as {
        expandedWord?: string;
        letterSources?: typeof parseResult.letterSources;
        appliedLOOPType?: string;
      } | undefined;

      // Use LOOP-extended data if available, otherwise use parse results
      const finalExpandedWord = loopSpellData?.expandedWord || spellState.expandedWord || spellState.inputWord;
      const finalLetterSources = loopSpellData?.letterSources || parseResult.letterSources || [];

      // Update spell state with the final (possibly LOOP-extended) data
      spellState.setExpandedWord(finalExpandedWord);
      spellState.setLetterSources(finalLetterSources);

      sequenceState.setCurrentSequence({
        ...sequenceWithStart,
        name: spellState.inputWord,
        intendedWord: spellState.inputWord, // User's intended word (before bridges)
        word: finalExpandedWord,
        metadata: {
          ...sequenceWithStart.metadata,
          spellData: {
            originalWord: spellState.inputWord,
            expandedWord: finalExpandedWord,
            letterSources: finalLetterSources,
            ...(loopSpellData?.appliedLOOPType && { appliedLOOPType: loopSpellData.appliedLOOPType }),
          },
        },
      });

      if (sequenceWithStart.startPlacement) {
        sequenceState.setSelectedStartPlacement(sequenceWithStart.startPlacement);
      }

      spellState.pushUndoSnapshot(UndoOperationType.SPELL_GENERATE, {
        word: spellState.inputWord,
      });

      spellState.markHasGeneratedOnce();
      haptic.trigger("success");

      // Dismiss keyboard after successful generation so user can see the workspace.
      // Without this, the workspace stays hidden (collapsed for keyboard mode) and
      // the user has to manually tap Done to see their generated sequence.
      if (isInputFocused) {
        isInputFocused = false;
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      }

    } catch (error) {
      console.error("Failed to generate sequence:", error);
      haptic.trigger("error");
      spellState.setError(error instanceof Error ? error.message : "Generation failed");
    } finally {
      spellState.setGenerating(false);
    }
  }

  function handleDismissError() {
    haptic.trigger("selection");
    spellState.clearError();
  }

  function handleLoopExpandedChange(expanded: boolean) {
    isLoopExpanded = expanded;
  }
</script>

<div
  bind:this={panelElement}
  class="spell-panel"
  class:input-mode={shouldCollapseLayout}
  data-is-desktop={isDesktop}
>
  <!-- Error Banner - hidden in collapsed mode or when Loop is expanded -->
  {#if spellState.error && !shouldCollapseLayout && !isLoopExpanded}
    <div class="error-banner" role="alert">
      <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
      <span class="error-message">{spellState.error}</span>
      <button
        class="error-dismiss"
        onclick={handleDismissError}
        aria-label="Dismiss error"
      >
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    </div>
  {/if}

  <!-- Word Input - collapses when Loop chip takes over (CSS transition-delay) -->
  <section
    class="word-section"
    class:loop-collapsed={isLoopExpanded}
  >
    <WordInput
      value={spellState.inputWord}
      onInput={handleWordChange}
      onFocusChange={handleInputFocusChange}
      onSubmit={handleGenerate}
    />
  </section>

  <!-- Settings - hidden only when collapsed (small screen + keyboard) -->
  {#if !shouldCollapseLayout}
    <section class="settings-section" class:loop-expanded={isLoopExpanded}>
      <SpellSettingsBar
        gridMode={spellState.selectedGridMode}
        preferences={spellState.preferences}
        onGridModeChange={handleGridModeChange}
        onPreferenceChange={handlePreferenceChange}
        onLoopExpandedChange={handleLoopExpandedChange}
      />
    </section>

    <!-- Generate Button - collapses when Loop chip takes over (CSS transition-delay) -->
    <button
      class="generate-button"
      class:generating={spellState.isGenerating}
      class:loop-collapsed={isLoopExpanded}
      onclick={handleGenerate}
      disabled={!canGenerate || isLoopExpanded}
      aria-label={canGenerate ? "Generate sequence" : "Enter a word first"}
    >
      {#if spellState.isGenerating}
        <div class="generate-sweep"></div>
        <span class="generate-label">Generating...</span>
      {:else}
        <i class="fas fa-magic" aria-hidden="true"></i>
        <span>Generate</span>
      {/if}
    </button>
  {/if}

  <!-- Keyboard toolbar for touch devices - detects actual keyboard visibility -->
  <!-- Shows Generate+Done when collapsed, just Done when full layout visible -->
  {#if hasTouchCapability}
    <SpellInputToolbar
      visible={isInputFocused}
      word={spellState.inputWord}
      showGenerate={shouldCollapseLayout}
      canGenerate={spellState.inputWord.length > 0}
      isGenerating={spellState.isGenerating}
      onDone={handleToolbarDone}
      onGenerate={handleGenerate}
      onKeyboardHeightChange={handleKeyboardHeightChange}
    />
  {/if}
</div>

<style>
  .spell-panel {
    /* Query the parent tool-panel container, not self */
    container-type: inline-size;
    container-name: spell-panel;
    /* Positioning context for Loop overlay (rendered in SpellSettingsBar) */
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: center;
    width: 100%;
    margin: 0 auto;
    height: 100%;
    min-height: 0;
    /* Auto-scroll for edge cases where layout switching leaves slight overflow */
    overflow-y: auto;
    overflow-x: hidden;

    /* Fluid spacing: 1vh scales naturally with viewport */
    --fluid-space: clamp(4px, 1vh, 12px);
    gap: var(--fluid-space);
    padding: var(--fluid-space);

    /* Scale factor for large screens - used by child components */
    --spell-scale: 1;

    /* Default max-width for mobile/small screens */
    max-width: 500px;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     INPUT MODE - Distraction-free typing on touch devices
     When virtual keyboard is present, hide settings and center the input
     in the available space ABOVE the toolbar (60px fixed height)
     ═══════════════════════════════════════════════════════════════════════════ */
  .spell-panel.input-mode {
    /* Center the word input in the available vertical space */
    justify-content: center;
    gap: 8px;
    /* Add bottom padding for the 60px toolbar so centering respects available space */
    padding-bottom: calc(var(--fluid-space) + 60px);
  }

  /* Medium height: expanded settings layout kicks in at 700px (matches SpellSettingsBar threshold) */
  @container tool-panel (min-height: 700px) {
    .spell-panel {
      max-width: 520px;
      --spell-scale: 1;
      --fluid-space: clamp(6px, 1vh, 12px);
    }
  }

  /* Large height: more room to breathe */
  @container tool-panel (min-height: 800px) {
    .spell-panel {
      max-width: 560px;
      --spell-scale: 1.02;
      --fluid-space: clamp(6px, 1.2vh, 14px);
    }
  }

  /* Sections */
  .word-section,
  .settings-section {
    flex-shrink: 0;
  }

  /* Loop takeover animation via CSS transition-delay.
     Collapsing: everything goes at once (350ms) - matches chip expansion timing.
     Restoring: height expands first (0ms), then opacity fades in (250ms delay).
     CSS applies the transition rules of the TARGET state, giving us
     directional sequencing with zero JS state machines. */
  .word-section,
  .generate-button {
    max-height: 200px;
    overflow: hidden;
    transition:
      max-height 300ms cubic-bezier(0.4, 0, 0.2, 1),
      opacity 200ms ease 250ms,
      padding 300ms ease,
      margin 300ms ease;
  }

  /* Collapsed state: all at once, no stagger - keeps chip expansion in sync */
  .word-section.loop-collapsed,
  button.generate-button.loop-collapsed {
    opacity: 0;
    max-height: 0;
    padding-top: 0;
    padding-bottom: 0;
    margin-top: 0;
    margin-bottom: 0;
    pointer-events: none;
    overflow: hidden;
    transition:
      opacity 200ms ease,
      max-height 300ms cubic-bezier(0.4, 0, 0.2, 1),
      padding 300ms ease,
      margin 300ms ease;
  }

  /* Collapse gap when Loop is taking over (prevents gap from collapsed items) */
  .spell-panel:has(.settings-section.loop-expanded) {
    gap: 0;
  }

  /* Generate Button - scales with container */
  .generate-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: calc(8px * var(--spell-scale));
    width: 100%;
    min-height: calc(48px * var(--spell-scale));
    padding: calc(12px * var(--spell-scale)) calc(16px * var(--spell-scale));
    background: var(--theme-accent, #6366f1);
    border: none;
    border-radius: calc(var(--settings-radius-md, 12px) * var(--spell-scale));
    color: white;
    font-size: calc(var(--font-size-min, 14px) * var(--spell-scale));
    font-weight: 700;
    cursor: pointer;
    /* Only transition hover/active properties - NOT max-height/opacity/padding/margin.
       Those are handled by the loop-collapse rules above (lines 501-528).
       Using 'all' here would clobber the sequenced transition-delay timings. */
    transition:
      background 150ms ease,
      transform 150ms ease,
      box-shadow 150ms ease;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    flex-shrink: 0;
  }

  .generate-button i {
    font-size: calc(16px * var(--spell-scale));
  }

  .generate-button:hover:not(:disabled) {
    background: var(--theme-accent-hover, #4f46e5);
  }

  /* Immediate press feedback */
  .generate-button:active:not(:disabled) {
    transform: scale(0.96);
    background: var(--theme-accent-hover, #4f46e5);
  }

  .generate-button:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 4px;
  }

  .generate-button:disabled {
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.3));
    cursor: not-allowed;
  }

  /* Generating state - shimmer sweep + initial pulse */
  .generate-button.generating {
    animation: generatePulse 600ms ease-out;
    pointer-events: none;
    overflow: hidden;
  }

  .generate-sweep {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.2) 40%,
      rgba(255, 255, 255, 0.3) 50%,
      rgba(255, 255, 255, 0.2) 60%,
      transparent 100%
    );
    background-size: 200% 100%;
    animation: generateSweep 1.8s ease-in-out infinite;
    pointer-events: none;
  }

  .generate-label {
    position: relative;
    z-index: 1;
  }

  @keyframes generateSweep {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  @keyframes generatePulse {
    0% {
      transform: scale(1);
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--theme-accent, #6366f1) 50%, transparent);
    }
    30% {
      transform: scale(0.97);
    }
    60% {
      box-shadow: 0 0 0 8px color-mix(in srgb, var(--theme-accent, #6366f1) 0%, transparent);
    }
    100% {
      transform: scale(1);
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--theme-accent, #6366f1) 0%, transparent);
    }
  }

  /* Error Banner - scales with container */
  .error-banner {
    display: flex;
    align-items: center;
    gap: calc(8px * var(--spell-scale));
    padding: calc(8px * var(--spell-scale)) calc(12px * var(--spell-scale));
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 15%, transparent);
    border: 1.5px solid var(--semantic-error, #ef4444);
    border-radius: calc(var(--settings-radius-md, 12px) * var(--spell-scale));
    color: var(--theme-text, #ffffff);
    font-size: calc(var(--font-size-min, 14px) * var(--spell-scale));
    flex-shrink: 0;
  }

  .error-banner i:first-child {
    color: var(--semantic-error, #ef4444);
    flex-shrink: 0;
    font-size: calc(16px * var(--spell-scale));
  }

  .error-message {
    flex: 1;
    line-height: 1.4;
  }

  .error-dismiss {
    display: flex;
    align-items: center;
    justify-content: center;
    width: calc(48px * var(--spell-scale));
    height: calc(48px * var(--spell-scale));
    margin: calc(-8px * var(--spell-scale)) calc(-8px * var(--spell-scale)) calc(-8px * var(--spell-scale)) 0;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: var(--settings-radius-sm, 8px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    cursor: pointer;
    flex-shrink: 0;
    transition: all 150ms ease;
  }

  .error-dismiss:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
    color: var(--theme-text, #ffffff);
  }

  .error-dismiss:focus-visible {
    outline: 2px solid var(--semantic-error, #ef4444);
    outline-offset: 2px;
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .generate-button,
    .error-dismiss,
    .word-section,
    .word-section.loop-collapsed,
    button.generate-button,
    button.generate-button.loop-collapsed {
      transition: none;
    }

    .generate-button.generating {
      animation: none;
    }

    .generate-sweep {
      animation: none;
      background: var(--theme-card-bg, rgba(255, 255, 255, 0.15));
      background-size: 100% 100%;
    }
  }
</style>
