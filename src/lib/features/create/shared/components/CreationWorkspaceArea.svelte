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

  import {
    CONTROL_LANDING_MS,
    controlArrive,
    controlLeave,
    type ControlPresenceParams,
  } from "#lib/shared/transitions/control-presence.js";
  import {
    growFade,
    opaqueFade,
    reducedMotion,
  } from "#lib/shared/transitions/motion.js";
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
  import { PlaybackPoster } from "../workspace-panel/components/playback-poster";
  import { isTheaterViewport } from "../services/workspace-theater";

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
  // The tools fold for a preview everywhere but the save view, which keeps
  // its form beside the preview (StandardWorkspaceLayout's tool panel).
  const playbackFolds = $derived(
    panelState.isWorkspacePreviewChosen && !panelState.isSaveToLibraryPanelOpen
  );
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

    const prepare = () =>
      untrack(() => {
        // Play has always restarted the sequence. Reuse the prepared engine,
        // but give it a fresh load identity so it returns to the first beat.
        playbackRun += 1;
        readyPlayback = null;

        if (key === retainedPlaybackKey) return;

        retainedPlayback = session;
        retainedPlaybackKey = key;
      });

    // The tools start folding on the tap. Mounting or loading the player in
    // the same task would hold that first frame back, so the player starts
    // once the motion's first frame is on screen (two frames later) and
    // comes forward when it is ready.
    if (reducedMotion()) {
      showPoster();
      prepare();
      return;
    }
    let frame = requestAnimationFrame(() => {
      // The tap's own frame is painted; the poster goes up on this one and
      // the player starts mounting on the next.
      showPoster();
      frame = requestAnimationFrame(prepare);
    });
    return () => cancelAnimationFrame(frame);
  });

  // Play's poster: the start picture holds the player's place from the frame
  // after the tap until the canvas has painted and fully arrived beneath it,
  // so the stage is never empty while a slow phone mounts the player.
  let stageEl = $state<HTMLElement | null>(null);
  const poster = new PlaybackPoster();
  let posterPending = $state(false);
  // The poster sits exactly where the canvas will be.
  let posterLanded = $state(false);

  function showPoster() {
    untrack(() => {
      if (
        !stageEl ||
        !playbackFolds ||
        workspaceSource !== "first" ||
        isTheaterViewport()
      )
        return;
      posterLanded = false;
      posterPending = poster.show(stageEl, reducedMotion(), () => {
        posterLanded = true;
      });
    });
  }

  // Play ended (Stop, or the player failed) while the poster was still up or
  // dissolving into the player: it goes back into its cell as the grid
  // returns. Once it has gone this does nothing.
  $effect(() => {
    if (playbackCandidate) return;
    posterPending = false;
    untrack(() => poster.retreat(reducedMotion()));
  });

  // The player is arriving under the landed poster (DualSourceCrossfade's
  // fade in, DURATION.normal): the poster dissolves into it as that fade
  // lands.
  $effect(() => {
    if (workspaceSource !== "second" || !posterPending || !posterLanded) return;
    posterPending = false;
    untrack(() => {
      const reduced = reducedMotion();
      poster.reveal(reduced, reduced ? 0 : DURATION.normal);
    });
  });

  onDestroy(() => poster.dispose());

  const workspaceSource = $derived<"first" | "second">(
    playback !== null &&
      playbackKey === retainedPlaybackKey &&
      readyPlayback === retainedPlayback
      ? "second"
      : "first"
  );

  // What the stage shows. While the poster holds the player's place, neither
  // source does: the grid steps back as the picture lifts out of it, and the
  // player comes in only once the picture has landed on the canvas's place.
  // Its controls then arrive around the picture, which becomes the canvas,
  // instead of the picture settling onto a player already standing there.
  const stageSource = $derived<"first" | "second" | null>(
    posterPending
      ? workspaceSource === "second" && posterLanded
        ? "second"
        : null
      : workspaceSource
  );

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

  /** Stop is the primary here, so the wave climbs the stack away from it. */
  function theaterPresenceAt(ring: number): ControlPresenceParams {
    return { edge: "right", ring, lead: () => CONTROL_LANDING_MS };
  }

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
  <div
    in:controlArrive|global={theaterPresenceAt(2)}
    out:controlLeave|global={theaterPresenceAt(2)}
  >
    <ViewSequenceButton
      purpose="viewer"
      onclick={() => panelState.handoffWorkspacePlaybackToViewer()}
    />
  </div>
  {#if CreateModuleState.canShowActionButtons()}
    <div
      in:controlArrive|global={theaterPresenceAt(1)}
      out:controlLeave|global={theaterPresenceAt(1)}
    >
      <ShareButton
        sequence={activeSequenceState.currentSequence}
        useMobileSheet={useMobileShareSheet}
      />
    </div>
  {/if}
  <div
    in:controlArrive|global={theaterPresenceAt(0)}
    out:controlLeave|global={theaterPresenceAt(0)}
  >
    <ViewSequenceButton
      purpose="play"
      isStopping
      onclick={() => panelState.stopWorkspacePlayback()}
    />
  </div>
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
  <div class="workspace-content" bind:this={stageEl}>
    <!-- Play collapses the tool panel as the grid hands off to the animator,
         and Close brings it back. Holding the outgoing side spares the hidden
         step grid or animator a re-layout at a size nobody sees. The
         wrapper's overflow: hidden clips a held side larger than the stage. -->
    <!-- The tools fold as soon as Play is asked for, so the grid keeps its
         box from that moment (hold) rather than from the swap. The player
         comes forward as it arrives and recedes as it leaves, a quicker fade
         out than in, and the inert swap waits until everything is still. -->
    <DualSourceCrossfade
      holdOutgoing
      hold={playbackFolds ? "first" : null}
      depth="second"
      settleInert
      exitDuration={workspaceSource === "first"
        ? DURATION.fast
        : DURATION.normal}
      active={stageSource}
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

  /* Play and Stop move the panel edge on the compositor: the outgoing player
     keeps its box past the workspace's new edge until the tools cover it
     (StandardWorkspaceLayout relaxes the clips around this one too). */
  :global(.panel-group[data-panel-motion="compositor"])
    .workspace-panel-wrapper {
    overflow: visible;
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
