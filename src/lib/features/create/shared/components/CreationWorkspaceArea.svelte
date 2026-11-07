<script lang="ts">
  /**
   * Creation Workspace Area
   *
   * Wrapper for the actual workspace panel when a creation method has been selected.
   * Provides fade transitions and reserves room for the button panel at the bottom.
   * The layout sets the room from the actual ButtonPanel height to adapt to
   * different screen sizes, and it folds away in theater mode.
   *
   * Extracted from CreateModule to reduce component size.
   *
   * Domain: Create module - Workspace presentation
   */

  import { growFade, opaqueFade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import type { IToolPanelMethods } from "../types/create-module-types";
  import type { LetterSource } from "#lib/shared/create/domain/spell-models.js";
  import WorkspacePanel from "../workspace-panel/core/WorkspacePanel.svelte";
  import WorkspaceSequenceHeader from "../workspace-panel/sequence-display/components/WorkspaceSequenceHeader.svelte";
  import { getCreateModuleContext } from "../context/create-module-context";
  import { navigationState } from "#lib/shared/navigation/state/navigation-state.svelte.js";
  import DualSourceCrossfade from "#lib/shared/components/DualSourceCrossfade.svelte";
  import LazyMount from "#lib/shared/components/LazyMount.svelte";
  import { onDestroy, untrack } from "svelte";
  import { isStartPlacementMorphCapturing } from "../../construct/start-placement-picker/services/start-placement-morph";
  import { hasOpenModalLayer } from "#lib/shared/keyboard/domain/shortcut-target-resolution.js";
  import ViewSequenceButton from "../workspace-panel/shared/components/buttons/ViewSequenceButton.svelte";
  import ShareButton from "../workspace-panel/shared/components/buttons/ShareButton.svelte";
  import { shareTarget } from "#lib/shared/mobile/share-action.svelte.js";

  const ctx = getCreateModuleContext();
  const { CreateModuleState, panelState, layout } = ctx;

  // Props (only presentation-specific props)
  let {
    animatingStepNumber = null,
    animationStateRef,
    currentDisplayWord,
    roomHeight = 0,
    roomEases = false,
    theater = false,
    headerFolded = false,
    compactToolbar = false,
    isSideBySideLayout,
    letterSources = null,
    onHeaderHeightChange,
  }: {
    animatingStepNumber?: number | null;
    animationStateRef?: ReturnType<IToolPanelMethods["getAnimationStateRef"]>;
    currentDisplayWord: string;
    /** The room under the workspace: the bar's height, or what the save
     *  view's switch needs while it sits there. */
    roomHeight?: number;
    /** Slide the room to a new height with the panels instead of snapping. */
    roomEases?: boolean;
    /** Sideways phone preview (workspace-theater): the header and the room
     *  under the workspace fold away so the player gets the whole height. */
    theater?: boolean;
    /** Only the header folds away, for a small preview beside the save form.
     *  The room under the workspace stays: the save view's switch is in it. */
    headerFolded?: boolean;
    /** The word sits in the bottom rail, so the header keeps only its badges */
    compactToolbar?: boolean;
    /** Use the actual panel direction when choosing pictograph columns. */
    isSideBySideLayout: boolean;
    /** Letter sources for spell tab - enables original vs bridge letter styling */
    letterSources?: LetterSource[] | null;
    /** The sequence header's height, for the workspace split's floor. */
    onHeaderHeightChange?: (height: number) => void;
  } = $props();

  // Derive values from context
  const practiceStepIndex = $derived(panelState.practiceStepIndex);
  const shouldOrbitAroundCenter = $derived(panelState.shouldOrbitAroundCenter);
  const isMobilePortrait = $derived(layout.isMobilePortrait());
  // The same sheet choice ButtonPanel makes for its Share.
  const useMobileShareSheet = $derived(
    shareTarget.isMobile || !layout.shouldUseSideBySideLayout
  );

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
    if (event.key !== "Escape" || !playbackCandidate) return;
    if (event.defaultPrevented) return;
    // A modal on top (share, clear confirm) owns Escape; the preview keeps
    // running underneath it. Beside the save view, the view's escape layer
    // normally takes the press first and flips back to the card itself. This
    // handler only sees it when focus is in a form field.
    if (hasOpenModalLayer()) return;
    event.preventDefault();
    panelState.stopWorkspacePlayback();
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

<!-- Theater mode's actions, beside the player while the bottom bar is away.
     The same owners and wiring as ButtonPanel: Viewer hands the running
     preview to the full viewer, Share shares the sequence being edited, and
     Play's stopping state ends the preview. -->
{#snippet theaterActions()}
  <ViewSequenceButton
    purpose="viewer"
    onclick={() => panelState.handoffWorkspacePlaybackToViewer()}
  />
  {#if CreateModuleState.canShowActionButtons()}
    <ShareButton
      sequence={activeSequenceState.currentSequence}
      useMobileSheet={useMobileShareSheet}
    />
  {/if}
  <ViewSequenceButton
    purpose="play"
    isStopping
    onclick={() => panelState.stopWorkspacePlayback()}
  />
{/snippet}

{#snippet animation()}
  {#if retainedPlayback}
    <!-- One player serves every sequence. Any source change stops playback
         first, so a new sequence always arrives while the player is hidden,
         and loading it into the mounted engine skips the full rebuild. -->
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
          if (failedRun === playbackRun && playbackCandidate)
            panelState.failWorkspacePlaybackPreparation(playbackCandidate);
        },
        onclose: () => panelState.stopWorkspacePlayback(),
        theaterActions,
        saving: panelState.isSaveToLibraryPanelOpen,
        onStepChange: (step: number) => (playbackStep = Math.floor(step)),
        onPlaybackChange: (
          reportedRun: number,
          step: number,
          playing: boolean
        ) => {
          const candidate = playbackCandidate;
          if (!candidate || reportedRun !== playbackRun) return;
          panelState.updateWorkspacePlaybackProgress(candidate, step, playing);
        },
      }}
      onStatusChange={(status) => {
        if (status === "error" && playbackCandidate)
          panelState.failWorkspacePlaybackPreparation(playbackCandidate);
      }}
    />
  {/if}
{/snippet}

<!-- Layout 2: Actual workspace when method is selected -->
<div
  class="workspace-panel-wrapper"
  in:opaqueFade={{
    // The chosen start card flies into this panel's start cell, and its
    // landing image carries this wrapper's opacity: fading in here would fade
    // the card out mid-flight. The panel's slide carries the entrance instead.
    duration: isStartPlacementMorphCapturing() ? 0 : DURATION.dramatic,
    delay: DURATION.normal,
  }}
  out:opaqueFade={{ duration: DURATION.emphasis }}
>
  <!-- Duration pattern preview renders inside the editable workspace timeline
       (SequenceDisplay swaps in panelState.previewSequence) — there is no
       separate preview workspace. -->
  <!-- CRITICAL: {#key} block ensures fresh StepGrid instances per tab
       This prevents animation state pollution (step-grid-display-state.svelte)
       But we DON'T key the parent layout to avoid workspace visibility timing issues -->
  <!-- Folds away in theater mode, so the player gets the height. Its box
       is this wrapper, so the header keeps measuring its own full height. -->
  {#if !theater && !headerFolded}
    <!-- Inert while saving along with the card it belongs to. -->
    <div
      class="sequence-header-presence"
      inert={panelState.isSaveToLibraryPanelOpen}
      transition:growFade={{ duration: DURATION.normal }}
    >
      <WorkspaceSequenceHeader
        sequenceState={activeSequenceState}
        word={currentDisplayWord}
        {letterSources}
        showTitle={!compactToolbar}
        quietBadges={navigationState.activeTab === "assemble"}
        onHeightChange={onHeaderHeightChange}
        activeStepNumber={playback
          ? playbackStep
          : (animatingStepNumber ?? practiceStepIndex)}
      />
    </div>
  {/if}
  <div class="workspace-content">
    <!-- Play collapses the tool panel as the grid hands off to the animator,
         and Close brings it back. Holding the outgoing side spares the hidden
         step grid or animator a re-layout at a size nobody sees. The
         wrapper's overflow: hidden clips a held side larger than the stage. -->
    <DualSourceCrossfade
      holdOutgoing
      active={playback !== null &&
      playbackKey === retainedPlaybackKey &&
      readyPlayback === retainedPlayback
        ? "second"
        : "first"}
      first={card}
      second={animation}
    />
  </div>
  <!-- The room the bottom bar covers. It folds away with the bar in theater
       mode and grows back to the bar's height when the bar returns. -->
  {#if !theater}
    <div
      class="button-panel-room"
      class:eases={roomEases}
      style:height="{roomHeight}px"
      aria-hidden="true"
      transition:growFade={{ duration: DURATION.normal }}
    ></div>
  {/if}
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
  }

  .sequence-header-presence,
  .button-panel-room {
    flex: 0 0 auto;
  }

  /* The same motion as PanelGroup's tracks, which move when the save view
     opens, so the workspace changes size as one movement. */
  .button-panel-room.eases {
    transition: height var(--transition-emphasis);
  }

  @media (prefers-reduced-motion: reduce) {
    .button-panel-room.eases {
      transition: none;
    }
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
