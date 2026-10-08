<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  /**
   * StandardWorkspaceLayout - Workspace and Tool Panel Layout Container
   *
   * Uses the shared PanelGroup for animated workspace and tool-panel transitions.
   * Both panels stay mounted while their tracks collapse when inactive.
   *
   * Domain: Create module - Layout
   */

  import { untrack } from "svelte";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import ButtonPanel from "../workspace-panel/shared/components/ButtonPanel.svelte";
  import UndoButton from "../workspace-panel/shared/components/buttons/UndoButton.svelte";
  import SaveToLibraryButton from "../workspace-panel/shared/components/buttons/SaveToLibraryButton.svelte";
  import LazyMount from "$lib/shared/components/LazyMount.svelte";
  import PanelGroup from "$lib/shared/panels/PanelGroup.svelte";
  import {
    growFade,
    reducedMotion,
    standardEasing,
  } from "$lib/shared/transitions/motion";
  import { DURATION } from "$lib/shared/transitions/transitions";
  // CreationWorkspaceArea (85-file subtree) only renders once a sequence exists,
  // so its chunk is deferred via LazyMount — empty/first-paint Create loads skip
  // it and warm it on idle instead.
  import CreationToolPanelSlot from "./CreationToolPanelSlot.svelte";
  import GenerateEmptyState from "../../generate/components/GenerateEmptyState.svelte";
  import type { createCreateModuleState as CreateModuleStateType } from "../state/create-module-state.svelte";
  import type { PanelCoordinationState } from "../state/panel-coordination-state.svelte";
  import type { IToolPanelMethods } from "../types/create-module-types";
  import { navigationState } from "$lib/shared/navigation/state/navigation-state.svelte";
  import type { LetterSource } from "$lib/shared/create/domain/spell-models";
  import { logConstructImmediateUndo } from "../../construct/services/construct-analytics";

  type CreateModuleState = ReturnType<typeof CreateModuleStateType>;

  let {
    shouldUseSideBySideLayout,
    CreateModuleState,
    panelState,
    currentDisplayWord,
    currentLetterSources = null,
    isInputMode = false,
    // Bindable props
    animatingStepNumber = $bindable(null),
    toolPanelRef = $bindable(null),
    buttonPanelElement = $bindable(),
    toolPanelElement = $bindable(),
    // Event handlers
    onClearSequence,
    onViewSequence = undefined,
    onOptionSelected,
    onOpenFilters,
    onCloseFilters,
  }: {
    shouldUseSideBySideLayout: boolean;
    CreateModuleState: CreateModuleState;
    panelState: PanelCoordinationState;
    currentDisplayWord: string;
    /** Letter sources for spell tab - enables original vs bridge letter styling */
    currentLetterSources?: LetterSource[] | null;
    /** Input mode active - collapse workspace to maximize space for word input */
    isInputMode?: boolean;
    animatingStepNumber?: number | null;
    toolPanelRef?: IToolPanelMethods | null;
    buttonPanelElement?: HTMLElement | null;
    toolPanelElement?: HTMLElement | null;
    onClearSequence: () => void;
    onViewSequence?: () => void;
    onOptionSelected: (option: PictographData) => Promise<void>;
    onOpenFilters: () => void;
    onCloseFilters: () => void;
  } = $props();

  let workspaceContainerRef: HTMLElement | null = $state(null);
  let layoutWrapperRef: HTMLElement | null = $state(null);
  let layoutWidth = $state(0);
  let layoutHeight = $state(0);
  let buttonPanelHeight = $state(0);
  let workspaceWidth = $state(0);
  let panelSizes = $state<number[]>([]);
  let appliedPanelLayout = $state<string | null>(null);

  // DERIVED STATE - Workspace Color Coding & Visibility

  // Check if workspace has any content to display
  // Use the exposed getActiveTabSequenceState() method which handles tab-specific sequence states
  const hasWorkspaceContent = $derived.by(() => {
    // Use the proper API method that handles tab switching
    const sequence = CreateModuleState.sequenceState.currentSequence;

    if (!sequence) {
      return false;
    }

    const hasStep = sequence.steps && sequence.steps.length > 0;
    const hasStartPlacement =
      sequence.startingPlacement || sequence.startPlacement;
    const result = hasStep || hasStartPlacement;

    return result;
  });

  const isGeneratorTab = $derived(navigationState.activeTab === "generate");

  // The Generate hint leaves as the workspace opens (and returns as it closes),
  // over the same span as the panel slide, so the settings cards travel once
  // instead of first jumping up into the hint's space. A tab switch swaps the
  // whole tool panel, so there the hint just appears or goes.
  let generateHintTab = navigationState.activeTab;
  let generateHintAnimates = false;
  $effect.pre(() => {
    const tab = navigationState.activeTab;
    void hasWorkspaceContent;
    generateHintAnimates = tab === generateHintTab;
    generateHintTab = tab;
  });
  function generateHintMotion() {
    return {
      duration: generateHintAnimates ? DURATION.emphasis : 0,
      // The panel's curve: on growFade's default the hint shrank faster than
      // the panel opened, and the cards nudged up before travelling down.
      easing: standardEasing,
    };
  }
  const isAssembleTab = $derived(navigationState.activeTab === "assemble");
  // A tall Assemble stage needs the sequence above the grid so both can use
  // the full width. Other Create tabs keep their existing desktop layout.
  const useSideBySidePanels = $derived(
    shouldUseSideBySideLayout &&
      (!isAssembleTab ||
        layoutWidth === 0 ||
        layoutHeight === 0 ||
        layoutWidth / layoutHeight >= 1.4)
  );
  const currentSequence = $derived(
    CreateModuleState.sequenceState.currentSequence
  );
  const canSaveToLibrary = $derived(CreateModuleState.canShowActionButtons());

  // Assemble tab: collapse tool panel when sequence is complete
  const isAssembleComplete = $derived(
    navigationState.activeTab === "assemble" &&
      CreateModuleState.assembleTabState?.assembleBuilderState?.phase ===
        "complete"
  );
  const isWorkspacePlayback = $derived(!!panelState.workspacePlayback);

  // A stacked phone-width Assemble workspace spends two control rows around
  // its step pictures. Folding Save into the bottom rail, Undo/Redo into the
  // grid panel's top-left corner, and the word into a thin strip between the
  // corner badges returns that height to the pictures. Share moves to the
  // Actions panel to make room. Below 340px the rail can't hold them, so the
  // two-row layout returns.
  const COMPACT_TOOLBAR_MIN_WIDTH = 340;
  const COMPACT_TOOLBAR_MAX_WIDTH = 600;
  const useCompactToolbar = $derived(
    isAssembleTab &&
      !useSideBySidePanels &&
      workspaceWidth >= COMPACT_TOOLBAR_MIN_WIDTH &&
      workspaceWidth < COMPACT_TOOLBAR_MAX_WIDTH
  );

  $effect(() => {
    panelState.setWorkspaceRailCompact(useCompactToolbar);
    return () => panelState.setWorkspaceRailCompact(false);
  });

  $effect(() => {
    const wrapper = layoutWrapperRef;
    if (!wrapper) return;
    const measure = () => {
      layoutWidth = wrapper.clientWidth;
      layoutHeight = wrapper.clientHeight;
    };
    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(wrapper);
    return () => resizeObserver.disconnect();
  });

  $effect(() => {
    const container = workspaceContainerRef;
    if (!container) return;
    const measure = () => {
      workspaceWidth = container.clientWidth;
    };
    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  });

  // The compact phone workspace spends a thin strip on the word, so it takes
  // a larger share to keep two rows of step pictures unclipped and readable.
  const defaultPanelSizes = $derived(
    useSideBySidePanels
      ? [1, 1]
      : useCompactToolbar
        ? [2, 3]
        : isAssembleTab
          ? [3, 7]
          : [5, 4]
  );

  $effect(() => {
    const layoutKey = `${useSideBySidePanels}:${isAssembleTab}:${useCompactToolbar}`;
    if (layoutKey === appliedPanelLayout) return;

    appliedPanelLayout = layoutKey;
    panelSizes = [...defaultPanelSizes];
  });

  // Fuse, Tunnel and Shape own complete workspaces inside their tool-panel surface.
  const ownsFullWorkspace = $derived(
    navigationState.activeTab === "fuse" ||
      navigationState.activeTab === "tunnel" ||
      navigationState.activeTab === "shape-engine"
  );

  // Workspace visible only when there's actual content to show
  const shouldShowWorkspace = $derived(
    !isInputMode && !ownsFullWorkspace && (hasWorkspaceContent || isAssembleTab)
  );
  const showCompactHistory = $derived(shouldShowWorkspace && useCompactToolbar);

  // A generated sequence draws its pictographs a tenth of a second or so after
  // the tap. Sliding the workspace open at once shared those frames and
  // stalled the slide partway, so the panel lays its content out at full size
  // but holds still until the pictures report ready (capped, so a slow draw
  // can't hold the open), and the hint waits to leave with it.
  const WORKSPACE_HOLD_CAP = DURATION.emphasis;
  let holdWorkspaceSlide = $state(false);
  let workspaceShownBefore: boolean | null = null;
  let workspaceShownTab = navigationState.activeTab;
  $effect.pre(() => {
    const shown = Boolean(shouldShowWorkspace);
    const tab = navigationState.activeTab;
    untrack(() => {
      const opening =
        workspaceShownBefore === false && shown && tab === workspaceShownTab;
      workspaceShownBefore = shown;
      workspaceShownTab = tab;
      if (opening && tab === "generate" && !reducedMotion()) {
        holdWorkspaceSlide = true;
      } else if (!shown || tab !== "generate") {
        holdWorkspaceSlide = false;
      }
    });
  });

  $effect(() => {
    const content = workspaceContainerRef;
    if (!holdWorkspaceSlide) return;
    if (!content) {
      holdWorkspaceSlide = false;
      return;
    }
    const heldAt = performance.now();
    // Pictures that report ready still paint in the frame that found them
    // ready, so the slide starts on the frame after.
    let drawnBefore = false;
    let frame = requestAnimationFrame(function check(now) {
      const drawn =
        content.querySelector(".pictograph-container") !== null &&
        !content.querySelector('.pictograph-container[aria-busy="true"]');
      if (drawnBefore || now - heldAt >= WORKSPACE_HOLD_CAP) {
        holdWorkspaceSlide = false;
        return;
      }
      drawnBefore = drawn;
      frame = requestAnimationFrame(check);
    });
    return () => cancelAnimationFrame(frame);
  });
  const showHistoryRecovery = $derived(
    !hasWorkspaceContent &&
      !isInputMode &&
      !ownsFullWorkspace &&
      CreateModuleState.sequenceState.currentSequence === null &&
      (CreateModuleState.canUndo || CreateModuleState.canRedo)
  );

  // While the preview is showing, a click on anything that isn't a control or
  // the player itself returns to the card, like a lightbox backdrop. The press
  // has to start on background too, so a scrub released off the player (whose
  // click lands on the shared ancestor) doesn't close it.
  const PLAYBACK_FOREGROUND =
    '[data-playback-foreground], button, a, input, select, textarea, label, [contenteditable], [role="button"], [role="slider"], [role="menu"], [role="listbox"], [role="dialog"], [aria-haspopup]';
  let playbackPressOnBackground = false;

  function isPlaybackBackground(target: EventTarget | null) {
    return target instanceof Element && !target.closest(PLAYBACK_FOREGROUND);
  }

  function notePlaybackPress(event: PointerEvent) {
    playbackPressOnBackground =
      isWorkspacePlayback && isPlaybackBackground(event.target);
  }

  function dismissPlaybackOnBackground(event: MouseEvent) {
    const pressedBackground = playbackPressOnBackground;
    playbackPressOnBackground = false;
    if (!isWorkspacePlayback || event.defaultPrevented) return;
    // Keyboard-synthesized clicks have no press; only pointer clicks count.
    if (!pressedBackground || !isPlaybackBackground(event.target)) return;
    // A modal on top owns its own backdrop; the preview keeps running.
    if (
      document.querySelector(
        'dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"]'
      )
    ) {
      return;
    }
    panelState.stopWorkspacePlayback();
  }

  function handleWorkspaceUndo() {
    if (navigationState.activeTab === "construct") {
      logConstructImmediateUndo();
    }
  }

  // Color border based on active CREATE tab (for visual workspace distinction)
  const workspaceBorderColor = $derived.by(() => {
    const activeTab = navigationState.activeTab;

    // Map each creation mode to its color (20% opacity for subtle border)
    switch (activeTab) {
      case "construct":
        return "rgba(59, 130, 246, 0.2)"; // Blue
      case "assemble":
        return "rgba(6, 182, 212, 0.2)"; // Cyan
      case "generate":
        return "rgba(245, 158, 11, 0.2)"; // Gold
      default:
        return "rgba(255, 255, 255, 0.1)"; // Default
    }
  });

  // Measure button panel height dynamically
  $effect(() => {
    if (!buttonPanelElement) {
      buttonPanelHeight = 0;
      return;
    }

    const updateHeight = () => {
      buttonPanelHeight = buttonPanelElement?.offsetHeight ?? 0;
    };

    // Initial measurement
    updateHeight();

    // Use ResizeObserver to track size changes (responsive layouts, container queries)
    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(buttonPanelElement);

    return () => resizeObserver.disconnect();
  });
</script>

{#snippet compactSaveAction()}
  {#if canSaveToLibrary}
    <div class="compact-save-action">
      <SaveToLibraryButton
        sequence={currentSequence}
        onclick={() => panelState.openSaveToLibraryPanel()}
      />
    </div>
  {/if}
{/snippet}

{#snippet workspacePanel()}
  <!-- Workspace Panel - Visible based on tab and content -->
  <!-- Background click is a pointer shortcut; Escape, the corner X and Stop
       are the keyboard-reachable exits. -->
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    bind:this={workspaceContainerRef}
    class="workspace-container"
    class:workspace-collapsed={!shouldShowWorkspace}
    class:assemble-workspace={isAssembleTab}
    class:playback-dismissible={isWorkspacePlayback}
    style:--workspace-border-color={workspaceBorderColor}
    onpointerdown={notePlaybackPress}
    onclick={dismissPlaybackOnBackground}
  >
    <!-- Workspace Content Area -->
    <div class="workspace-content">
      <!-- Its code is fetched on idle, so the first sequence mounts in the
           same task that opens the workspace instead of arriving mid-slide.
           It still unmounts whenever the workspace empties. -->
      <LazyMount
        loader={() => import("./CreationWorkspaceArea.svelte")}
        active={hasWorkspaceContent}
        keepAlive={false}
        prefetch
        debugName="CreationWorkspaceArea"
        props={{
          animatingStepNumber,
          currentDisplayWord,
          buttonPanelHeight,
          compactToolbar: useCompactToolbar,
          isSideBySideLayout: useSideBySidePanels,
          letterSources: currentLetterSources,
          ...(toolPanelRef?.getAnimationStateRef?.()
            ? { animationStateRef: toolPanelRef.getAnimationStateRef() }
            : {}),
        }}
      />
      {#if !hasWorkspaceContent && isAssembleTab}
        <div class="assemble-workspace-placeholder">
          <i class="fas fa-layer-group" aria-hidden="true"></i>
          <p>{t("create_ui_build_on_the_grid_pictographs_appear_here")}</p>
        </div>
      {/if}
    </div>

    {#if shouldShowWorkspace && !useCompactToolbar}
      <div
        class="workspace-history-actions"
        inert={!!panelState.workspacePlayback}
      >
        <UndoButton
          {CreateModuleState}
          onAction={handleWorkspaceUndo}
        />
        <UndoButton
          {CreateModuleState}
          direction="redo"
        />
      </div>
    {/if}

    {#if shouldShowWorkspace && canSaveToLibrary && !useCompactToolbar}
      <div class="workspace-save-action">
        <SaveToLibraryButton
          sequence={currentSequence}
          onclick={() => panelState.openSaveToLibraryPanel()}
        />
      </div>
    {/if}

    <!-- Button Panel - Shows when workspace is visible -->
    {#if shouldShowWorkspace}
      <div class="button-panel-wrapper" bind:this={buttonPanelElement}>
        <ButtonPanel
          {onClearSequence}
          {onViewSequence}
          compact={useCompactToolbar}
          trailingActions={compactSaveAction}
        />
      </div>
    {/if}

    <!-- Build Another overlay - shown when assemble sequence is complete.
         Positioned above the ButtonPanel using its measured height. -->
    {#if isAssembleComplete}
      <div
        class="build-another-overlay"
        style:bottom="{buttonPanelHeight + 16}px"
      >
        <button class="build-another-btn" onclick={onClearSequence}>
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>{t("create_ui_build_another")}</span>
        </button>
      </div>
    {/if}
  </div>
{/snippet}

{#snippet toolPanel()}
  <!-- Tool Panel -->
  <div
    class="tool-panel-container"
    class:has-clear-recovery={showHistoryRecovery && !showCompactHistory}
    style:--history-recovery-count={Number(CreateModuleState.canUndo) +
      Number(CreateModuleState.canRedo)}
    bind:this={toolPanelElement}
  >
    <!-- On phones Undo/Redo sit in the grid panel's empty top-left corner,
         clear of every grid point; that pair also undoes a Clear. -->
    {#if showCompactHistory}
      <div class="compact-history-actions" inert={isWorkspacePlayback}>
        <UndoButton {CreateModuleState} onAction={handleWorkspaceUndo} quiet />
        <UndoButton {CreateModuleState} direction="redo" quiet />
      </div>
    {:else if showHistoryRecovery}
      <div class="clear-recovery-action">
        {#if CreateModuleState.canUndo}
          <UndoButton {CreateModuleState} />
        {/if}
        {#if CreateModuleState.canRedo}
          <UndoButton {CreateModuleState} direction="redo" />
        {/if}
      </div>
    {/if}

    <div class="tool-panel-content">
      {#if (!hasWorkspaceContent || holdWorkspaceSlide) && isGeneratorTab}
        <div
          class="generate-empty-slot"
          in:growFade={generateHintMotion()}
          out:growFade={generateHintMotion()}
        >
          <GenerateEmptyState />
        </div>
      {/if}
      <CreationToolPanelSlot
        bind:toolPanelRef
        {onOptionSelected}
        onPracticeStepIndexChange={(index) => {
          panelState.setPracticeStepIndex(index);
        }}
        {onOpenFilters}
        {onCloseFilters}
      />
    </div>
  </div>
{/snippet}

<div bind:this={layoutWrapperRef} class="layout-wrapper">
  <PanelGroup
    direction={useSideBySidePanels ? "horizontal" : "vertical"}
    bind:sizes={panelSizes}
    gap={0}
    holdMotion={holdWorkspaceSlide}
    panels={[
      {
        id: "create-workspace",
        content: workspacePanel,
        defaultSize: defaultPanelSizes[0],
        fixedSize: !shouldShowWorkspace ? "0px" : undefined,
        resizable: false,
        // The step grid lays out once at its final size and the opening
        // edge uncovers it, rather than resizing every pictograph per frame.
        revealContent: true,
      },
      {
        id: "create-tool-panel",
        content: toolPanel,
        defaultSize: defaultPanelSizes[1],
        fixedSize: isWorkspacePlayback || isAssembleComplete ? "0px" : undefined,
        resizable: false,
      },
    ]}
  />
</div>

<!-- Spotlight Modal - Replaced with /sequence/[id] route navigation -->

<style>
  .layout-wrapper {
    display: flex;
    height: 100%;
    width: 100%;
    overflow: hidden;

    /* View Transitions API - use unique name to avoid duplicates */
    view-transition-name: create-workspace-layout;
  }

  /* Shared container styles */
  .workspace-container,
  .tool-panel-container {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
    min-height: 0;
  }

  .workspace-container {
    container-type: inline-size;
    container-name: create-workspace;
    position: relative;

    /* Colored border for visual workspace distinction */
    border: 1px solid var(--workspace-border-color, var(--theme-stroke));
    border-radius: 8px;

    /* Smooth opacity and border transitions */
    opacity: 1;
    transition:
      opacity 350ms cubic-bezier(0.4, 0, 0.2, 1),
      border-color 300ms ease;
  }

  .workspace-container {
    --workspace-leading-actions-width: calc(
      var(--min-touch-target, 44px) * 2 + var(--settings-spacing-sm, 8px)
    );
  }

  .workspace-history-actions {
    position: absolute;
    top: 8px;
    left: 12px;
    z-index: 161;
    display: flex;
    gap: var(--settings-spacing-sm, 8px);
    pointer-events: auto;
  }

  .workspace-save-action {
    --workspace-action-label-display: inline;
    --workspace-action-width: auto;
    --workspace-action-gap: 8px;
    --workspace-action-padding-inline: 16px;
    --workspace-action-radius: 999px;
    position: absolute;
    top: 8px;
    right: 12px;
    z-index: 161;
    display: flex;
    pointer-events: auto;
  }

  .workspace-history-actions[inert],
  .compact-history-actions[inert] {
    opacity: 0.45;
  }

  /* The rail's zones let taps through to the grid; this wrapper is authored
     here, so ButtonPanel's own wrapper rule doesn't reach it. */
  .compact-save-action {
    pointer-events: auto;
  }

  /* Same corner as the clear-recovery Undo, which this pair replaces. */
  .compact-history-actions {
    position: absolute;
    top: clamp(6px, 1.5cqh, 14px);
    left: clamp(6px, 1.5cqw, 18px);
    z-index: 160;
    display: flex;
    gap: var(--settings-spacing-sm, 8px);
    pointer-events: auto;
  }

  .compact-save-action {
    display: grid;
    place-items: center;
  }

  /* The step pictures sit on the theme's panel colour so a busy background
     image doesn't compete with them, matching the grid panel below. */
  .workspace-container.assemble-workspace {
    background: var(--theme-panel-bg);
  }

  /* Signals that the empty space around the preview closes it. */
  .workspace-container.playback-dismissible {
    cursor: pointer;
  }

  /* Collapsed state - invisible but still in layout flow */
  .workspace-container.workspace-collapsed {
    opacity: 0;
    pointer-events: none;
    border-color: transparent;
  }

  .workspace-content {
    flex: 1;
    min-height: 0;
    position: relative;
    overflow: hidden;
  }

  .assemble-workspace-placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--settings-spacing-sm, 8px);
    padding: var(--settings-spacing-lg, 20px);
    color: var(--theme-text-dim);
    text-align: center;
  }

  .assemble-workspace-placeholder i {
    font-size: var(--font-size-lg, 18px);
    color: var(--theme-accent);
  }

  .assemble-workspace-placeholder p {
    margin: 0;
    font-size: var(--font-size-min, 14px);
  }

  .button-panel-wrapper {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    /* Must be above drawer content (z-index: 150) so buttons remain clickable
       when slide-in panels are open */
    z-index: 160;
    /* Allow taps to pass through empty areas to the step grid below */
    pointer-events: none;
  }

  .tool-panel-container {
    position: relative;
    container-type: size;
    container-name: tool-panel;
    --settings-generate-panel-max-height: min(65cqh, 750px);
    --settings-generate-panel-half-max-height: min(32.5cqh, 375px);
    /* The Level selector is pinned to the top of the settings panel and owns
       that band outright. Both the toolbar (as its min-height) and the Generate
       empty state (as its top floor) read this one number, so the empty state
       cannot drift up over the selector when its content grows. */
    --generate-level-toolbar-height: 4.75rem;
  }

  @media (min-width: 1680px) {
    .tool-panel-container {
      --settings-generate-panel-max-height: min(70cqh, 56rem);
      --settings-generate-panel-half-max-height: min(35cqh, 28rem);
      --generate-level-toolbar-height: 5.25rem;
    }
  }

  @media (min-width: 2600px) {
    .tool-panel-container {
      --settings-generate-panel-max-height: min(72cqh, 70rem);
      --settings-generate-panel-half-max-height: min(36cqh, 35rem);
      --generate-level-toolbar-height: 6.25rem;
    }
  }

  .tool-panel-container.has-clear-recovery {
    --picker-leading-action-offset: calc(
      var(--history-recovery-count, 1) *
        (var(--min-touch-target, 48px) + var(--settings-spacing-sm, 8px))
    );
  }

  /* On stacked empty Generate screens the hint owns real space above the
     settings. The routed panel used to keep height: 100%, which added the
     hint's height on top and pushed Generate underneath the mobile nav. The
     column holds whether or not the hint is there: switched on only with the
     hint, it switched off the moment Generate was tapped, while the hint was
     still collapsing, and the settings jumped 116px taller under it. */
  .tool-panel-content {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .tool-panel-content > :global(.tool-panel-wrapper) {
    flex: 1 1 0;
    height: auto;
    min-height: 0;
  }

  /* The hint's own box, so it can collapse in step with the workspace slide. */
  .generate-empty-slot {
    flex-shrink: 0;
  }

  .clear-recovery-action {
    display: flex;
    gap: var(--settings-spacing-sm, 8px);
    position: absolute;
    top: clamp(6px, 1.5cqh, 14px);
    left: clamp(6px, 1.5cqw, 18px);
    z-index: 160;
    pointer-events: auto;
  }

  @media (min-width: 1100px) and (min-height: 700px) {
    /* Match the picker's shared 56px heading row so recovery shares the title's baseline. */
    .tool-panel-container:has(:global(.start-pos-picker))
      .clear-recovery-action {
      top: calc(14px + (56px - var(--min-touch-target, 44px)) / 2);
      left: clamp(24px, 2.5vw, 64px);
    }
  }

  /* Build Another overlay - appears over workspace when assemble is complete */
  .build-another-overlay {
    position: absolute;
    /* bottom is set dynamically via inline style based on buttonPanelHeight */
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
    z-index: 20;
    pointer-events: none;
  }

  .build-another-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 24px;
    border-radius: 14px;
    border: 1.5px solid var(--theme-accent, #6366f1);
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 15%,
      var(--theme-panel-bg, rgba(18, 18, 28, 0.98))
    );
    color: var(--theme-text, #fff);
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    cursor: pointer;
    pointer-events: auto;
    min-height: var(--min-touch-target, 44px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    transition: background 0.15s ease;
  }

  .build-another-btn:hover {
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 30%,
      var(--theme-panel-bg, rgba(18, 18, 28, 0.98))
    );
  }

  .build-another-btn:focus-visible {
    outline: 2px solid #ffffff;
    outline-offset: 3px;
  }

  .build-another-btn i {
    font-size: 12px;
  }

  @media (prefers-reduced-motion: reduce) {
    .build-another-btn {
      transition: none;
    }
  }

  /* The Generate-tab empty state (hint + first-run tour offer) now lives in
     GenerateEmptyState.svelte, rendered inside .tool-panel-container above. */
</style>
