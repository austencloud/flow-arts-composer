<script lang="ts">
  /**
   * Creation Workspace Area
   *
   * Wrapper for the actual workspace panel when a creation method has been selected.
   * Provides fade transitions and dynamic padding for the button panel at the bottom.
   * The padding is measured from the actual ButtonPanel height to adapt to different
   * screen sizes and responsive layouts.
   *
   * Extracted from CreateModule to reduce component size.
   *
   * Domain: Create module - Workspace presentation
   */

  import { fade } from "svelte/transition";
  import type { IToolPanelMethods } from "../types/create-module-types";
  import type { LetterSource } from "$lib/shared/create/domain/spell-models";
  import WorkspacePanel from "../workspace-panel/core/WorkspacePanel.svelte";
  import WorkspaceSequenceHeader from "../workspace-panel/sequence-display/components/WorkspaceSequenceHeader.svelte";
  import { getCreateModuleContext } from "../context/create-module-context";
  import { navigationState } from "$lib/shared/navigation/state/navigation-state.svelte";
  import DualSourceCrossfade from "$lib/shared/components/DualSourceCrossfade.svelte";
  import LazyMount from "$lib/shared/components/LazyMount.svelte";
  import { onDestroy, untrack } from "svelte";

  const ctx = getCreateModuleContext();
  const { CreateModuleState, panelState, layout } = ctx;

  // Props (only presentation-specific props)
  let {
    animatingStepNumber = null,
    animationStateRef,
    currentDisplayWord,
    buttonPanelHeight = 0,
    letterSources = null,
  }: {
    animatingStepNumber?: number | null;
    animationStateRef?: ReturnType<IToolPanelMethods["getAnimationStateRef"]>;
    currentDisplayWord: string;
    buttonPanelHeight?: number;
    /** Letter sources for spell tab - enables original vs bridge letter styling */
    letterSources?: LetterSource[] | null;
  } = $props();

  // Derive values from context
  const practiceStepIndex = $derived(panelState.practiceStepIndex);
  const shouldOrbitAroundCenter = $derived(panelState.shouldOrbitAroundCenter);
  const isSideBySideLayout = $derived(layout.shouldUseSideBySideLayout);
  const isMobilePortrait = $derived(layout.isMobilePortrait());

  const optionAudition = $derived(panelState.optionAudition);
  const playback = $derived(panelState.workspacePlayback);
  const playbackPreparation = $derived(panelState.workspacePlaybackPreparation);
  const playbackCandidate = $derived(playbackPreparation ?? playback);
  let readyPlayback = $state.raw<typeof playback>(null);
  let retainedPlayback = $state.raw<typeof playback>(null);
  let retainedPlaybackKey = $state<string | null>(null);
  let playbackRun = $state(0);
  let playbackStep = $state(0);
  const playbackKeys = new WeakMap<object, string>();
  const loadWorkspacePlayback = () =>
    import("../workspace-panel/components/WorkspacePlayback.svelte");

  const playbackKey = $derived.by(() => {
    if (!playbackCandidate) return null;
    const knownKey = playbackKeys.get(playbackCandidate);
    if (knownKey) return knownKey;
    const key = [
      playbackCandidate.sourceTab,
      panelState.workspacePlaybackSourceRevision,
      playbackCandidate.sequence.id,
    ].join(":");
    playbackKeys.set(playbackCandidate, key);
    return key;
  });

  $effect(() => {
    const session = playbackCandidate;
    const key = playbackKey;
    if (!session || !key) return;

    untrack(() => {
      // Play has always restarted the sequence. Reuse the prepared engine, but
      // give it a fresh load identity so it returns to the first beat first.
      playbackRun += 1;
      readyPlayback = null;

      if (key === retainedPlaybackKey) return;

      retainedPlayback = session;
      retainedPlaybackKey = key;
    });
  });

  onDestroy(() => panelState.stopWorkspacePlayback());

  $effect(() => {
    panelState.syncWorkspacePlaybackSource(
      navigationState.activeTab,
      activeSequenceState.currentSequenceRevision
    );
  });

  function stopOnEscape(event: KeyboardEvent) {
    if (event.key === "Escape" && playbackCandidate) {
      event.preventDefault();
      panelState.stopWorkspacePlayback();
    }
  }

  $effect(() => {
    if (
      navigationState.activeTab !== "construct" &&
      panelState.optionAudition
    ) {
      panelState.exitOptionAudition();
    }
  });

  // CRITICAL: Derive the active tab's sequence state reactively
  // Track both the active tab AND the sequence within that tab
  // This ensures the workspace updates when:
  // 1. The user switches tabs
  // 2. Sequence actions modify the state (mirror, rotate, etc.)
  const activeSequenceState = $derived.by(() => {
    // Track the active tab so we re-evaluate when it changes
    const activeTab = navigationState.activeTab;

    // Get the sequence state for the active tab
    const state = CreateModuleState.getActiveTabSequenceState();

    // Also track the currentSequence so we re-evaluate when it changes
    // This is the key fix - we need to access the reactive property
    const _sequence = state.currentSequence;

    return state;
  });

  $effect(() => {
    const audition = optionAudition;
    if (
      audition &&
      activeSequenceState.currentSequenceRevision !==
        audition.sourceSequenceRevision
    ) {
      panelState.exitOptionAudition();
    }
  });
</script>

<svelte:window onkeydown={stopOnEscape} />

<!-- Warm the player code while the editable workspace is stable. This leaves
     its engine unmounted until Play, so hidden playback cannot consume frames. -->
<LazyMount loader={loadWorkspacePlayback} prefetch />

{#snippet card()}
  {#key navigationState.activeTab}
    <WorkspacePanel
      sequenceState={activeSequenceState}
      createModuleState={CreateModuleState}
      {panelState}
      {practiceStepIndex}
      {animatingStepNumber}
      {isSideBySideLayout}
      {shouldOrbitAroundCenter}
      {animationStateRef}
      {currentDisplayWord}
      {letterSources}
    />
  {/key}
{/snippet}

{#snippet animation()}
  {#if retainedPlayback}
    {#key retainedPlayback}
      {@const session = retainedPlayback}
      <LazyMount
        loader={loadWorkspacePlayback}
        active
        retryKey={playbackRun}
        props={{
          sequence: session.sequence,
          active: playback !== null && playbackKey === retainedPlaybackKey,
          run: playbackRun,
          onready: (readyRun: number) => {
            if (!playbackCandidate || readyRun !== playbackRun) return;
            readyPlayback = session;
            panelState.confirmWorkspacePlaybackReady(playbackCandidate);
          },
          onerror: (failedRun: number) => {
            if (failedRun === playbackRun)
              panelState.failWorkspacePlaybackPreparation(playbackCandidate!);
          },
          onclose: () => panelState.stopWorkspacePlayback(),
          onStepChange: (step: number) => (playbackStep = Math.floor(step)),
          onPlaybackChange: (
            reportedRun: number,
            step: number,
            playing: boolean
          ) => {
            const candidate = playbackCandidate;
            if (!candidate || reportedRun !== playbackRun) return;
            panelState.updateWorkspacePlaybackProgress(
              candidate,
              step,
              playing
            );
          },
        }}
        onStatusChange={(status) => {
          if (status === "error" && playbackCandidate)
            panelState.failWorkspacePlaybackPreparation(playbackCandidate);
        }}
      />
    {/key}
  {/if}
{/snippet}

<!-- Layout 2: Actual workspace when method is selected -->
<div
  class="workspace-panel-wrapper"
  style:padding-bottom="{buttonPanelHeight}px"
  in:fade={{ duration: 400, delay: 200 }}
  out:fade={{ duration: 300 }}
>
  <!-- Duration pattern preview renders inside the editable workspace timeline
       (SequenceDisplay swaps in panelState.previewSequence) — there is no
       separate preview workspace. -->
  <!-- CRITICAL: {#key} block ensures fresh StepGrid instances per tab
       This prevents animation state pollution (step-grid-display-state.svelte)
       But we DON'T key the parent layout to avoid workspace visibility timing issues -->
  <WorkspaceSequenceHeader
    sequenceState={activeSequenceState}
    word={currentDisplayWord}
    {letterSources}
    activeStepNumber={playback
      ? playbackStep
      : (animatingStepNumber ?? practiceStepIndex)}
  />
  <div class="workspace-content">
    <DualSourceCrossfade
      active={playback !== null &&
      playbackKey === retainedPlaybackKey &&
      readyPlayback === retainedPlayback
        ? "second"
        : "first"}
      first={card}
      second={animation}
    />
  </div>
</div>

<style>
  /* Workspace panel wrapper (Layout 2) */
  .workspace-panel-wrapper {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    /* padding-bottom is set dynamically via style attribute based on ButtonPanel height */
  }

  .workspace-panel-wrapper :global(.source > .workspace-panel) {
    height: 100%;
  }

  .workspace-content {
    position: relative;
    flex: 1;
    min-height: 0;
  }
</style>
