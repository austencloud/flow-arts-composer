<script lang="ts">
  /**
   * StandardWorkspaceLayout - Workspace and Tool Panel Layout Container
   *
   * Uses CSS Grid for smooth, animatable layout transitions.
   * Workspace is always in DOM but collapses when empty.
   *
   * Domain: Create module - Layout
   */

  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import ButtonPanel from "../workspace-panel/shared/components/ButtonPanel.svelte";
  import UndoButton from "../workspace-panel/shared/components/buttons/UndoButton.svelte";
  import SaveToLibraryButton from "../workspace-panel/shared/components/buttons/SaveToLibraryButton.svelte";
  import LazyMount from "$lib/shared/components/LazyMount.svelte";
  import PanelGroup from "$lib/shared/panels/PanelGroup.svelte";
  // CreationWorkspaceArea (85-file subtree) only renders once a sequence exists,
  // so its chunk is deferred via LazyMount — empty/first-paint Create loads skip it.
  import CreationToolPanelSlot from "./CreationToolPanelSlot.svelte";
  import GenerateEmptyState from "../../generate/components/GenerateEmptyState.svelte";
  import type { createCreateModuleState as CreateModuleStateType } from "../state/create-module-state.svelte";
  import type { PanelCoordinationState } from "../state/panel-coordination-state.svelte";
  import type { IToolPanelMethods } from "../types/create-module-types";
  import { navigationState } from "$lib/shared/navigation/state/navigation-state.svelte";
  import type { LetterSource } from "$lib/shared/create/domain/spell-models";
  import { UndoOperationType } from "../services/undo-manager";
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
  let buttonPanelHeight = $state(0);
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
    const hasStartPosition =
      sequence.startingPosition || sequence.startPosition;
    const result = hasStep || hasStartPosition;

    return result;
  });

  const isGeneratorTab = $derived(navigationState.activeTab === "generate");
  const isAssembleTab = $derived(navigationState.activeTab === "assemble");
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

  $effect(() => {
    const layoutKey = `${shouldUseSideBySideLayout}:${isAssembleTab}`;
    if (layoutKey === appliedPanelLayout) return;

    appliedPanelLayout = layoutKey;
    panelSizes = shouldUseSideBySideLayout
      ? [1, 1]
      : isAssembleTab
        ? [3, 7]
        : [5, 4];
  });

  // Fuse and Tunnel own complete workspaces inside their tool-panel surface.
  const ownsFullWorkspace = $derived(
    navigationState.activeTab === "fuse" ||
      navigationState.activeTab === "tunnel"
  );

  // Workspace visible only when there's actual content to show
  const shouldShowWorkspace = $derived(
    !isInputMode && !ownsFullWorkspace && (hasWorkspaceContent || isAssembleTab)
  );
  const showClearRecovery = $derived(
    !hasWorkspaceContent &&
      CreateModuleState.sequenceState.currentSequence === null &&
      CreateModuleState.undoController?.nextUndoEntry?.type ===
        UndoOperationType.CLEAR_SEQUENCE
  );

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

{#snippet workspacePanel()}
  <!-- Workspace Panel - Visible based on tab and content -->
  <div
    bind:this={workspaceContainerRef}
    class="workspace-container"
    class:workspace-collapsed={!shouldShowWorkspace}
    class:assemble-workspace={isAssembleTab}
    style:--workspace-border-color={workspaceBorderColor}
  >
    <!-- Workspace Content Area -->
    <div class="workspace-content">
      {#if hasWorkspaceContent}
        <LazyMount
          loader={() => import("./CreationWorkspaceArea.svelte")}
          active
          props={{
            animatingStepNumber,
            currentDisplayWord,
            buttonPanelHeight,
            letterSources: currentLetterSources,
            ...(toolPanelRef?.getAnimationStateRef?.()
              ? { animationStateRef: toolPanelRef.getAnimationStateRef() }
              : {}),
          }}
        />
      {:else if isAssembleTab}
        <div class="assemble-workspace-placeholder">
          <i class="fas fa-layer-group" aria-hidden="true"></i>
          <p>Build on the grid. Pictographs appear here.</p>
        </div>
      {/if}
    </div>

    {#if shouldShowWorkspace}
      <div
        class="workspace-history-actions"
        inert={!!panelState.workspacePlayback}
      >
        <UndoButton {CreateModuleState} onAction={handleWorkspaceUndo} />
        <UndoButton {CreateModuleState} direction="redo" />
      </div>
    {/if}

    {#if shouldShowWorkspace && canSaveToLibrary}
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
        <ButtonPanel {onClearSequence} {onViewSequence} />
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
          <span>Build Another</span>
        </button>
      </div>
    {/if}
  </div>
{/snippet}

{#snippet toolPanel()}
  <!-- Tool Panel -->
  <div
    class="tool-panel-container"
    class:has-clear-recovery={showClearRecovery}
    bind:this={toolPanelElement}
  >
    {#if showClearRecovery}
      <div class="clear-recovery-action">
        <UndoButton {CreateModuleState} />
      </div>
    {/if}

    <div
      class="tool-panel-content"
      class:has-generate-empty={!hasWorkspaceContent && isGeneratorTab}
    >
      {#if !hasWorkspaceContent && isGeneratorTab}
        <GenerateEmptyState />
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
    direction={shouldUseSideBySideLayout ? "horizontal" : "vertical"}
    bind:sizes={panelSizes}
    gap={0}
    panels={[
      {
        id: "create-workspace",
        content: workspacePanel,
        defaultSize: shouldUseSideBySideLayout ? 1 : isAssembleTab ? 3 : 5,
        fixedSize: !shouldShowWorkspace ? "0px" : undefined,
        resizable: false,
      },
      {
        id: "create-tool-panel",
        content: toolPanel,
        defaultSize: shouldUseSideBySideLayout ? 1 : isAssembleTab ? 7 : 4,
        fixedSize:
          isWorkspacePlayback || isAssembleComplete ? "0px" : undefined,
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

  .workspace-history-actions[inert] {
    opacity: 0.45;
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
      var(--min-touch-target, 48px) + var(--settings-spacing-sm, 8px)
    );
  }

  .tool-panel-content {
    position: relative;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  /* On stacked empty Generate screens the hint owns real space above the
     settings. The routed panel used to keep height: 100%, which added the
     hint's height on top and pushed Generate underneath the mobile nav. */
  .tool-panel-content.has-generate-empty {
    display: flex;
    flex-direction: column;
  }

  .tool-panel-content.has-generate-empty > :global(.tool-panel-wrapper) {
    flex: 1 1 0;
    height: auto;
    min-height: 0;
  }

  .clear-recovery-action {
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
