<script lang="ts">
  import ProgressRing from "$lib/shared/components/loading/ProgressRing.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { flyFade } from "$lib/shared/transitions/motion";
  /**
   * Creation Tool Panel Slot
   *
   * Renders the appropriate tool panel based on the active tab.
   * Each creation mode (Constructor, Generator, Assemble) has its own dedicated panel.
   *
   * Domain: Create module - Tool panel presentation
   */

  import { navigationState } from "$lib/shared/navigation/state/navigation-state.svelte";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import type { IToolPanelMethods } from "../types/create-module-types";
  import { getCreateModuleContext } from "../context/create-module-context";
  import LazyMount from "$lib/shared/components/LazyMount.svelte";
  import ConstructTabContent from "./ConstructTabContent.svelte";
  // GeneratePanel (136-file subtree), AssembleToolPanel (21), and FuseTab (235!)
  // are deferred via LazyMount — only the active build-mode tab's chunk loads.
  // Construct is the default tab so ConstructTabContent stays eager. This keeps
  // ~400 files out of the Create module's first-paint graph (see scripts/trace-create-three.cjs).
  import {
    logConstructStartPositionCompleted,
    type StartPositionPath,
  } from "../../construct/services/construct-analytics";
  import { getStartPositionDisplayLabel } from "../../construct/start-position-picker/services/start-position-display-label";
  import { areStartPositionsEquivalent } from "../../construct/start-position-picker/services/start-position-equivalence";

  const ctx = getCreateModuleContext();
  const {
    CreateModuleState: createModuleState,
    constructTabState,
    constructTutorialState,
    panelState,
    layout,
  } = ctx;

  // Derive values from context
  const isSideBySideLayout = () => layout.shouldUseSideBySideLayout;
  const isFilterPanelOpen = $derived(panelState.isFilterPanelOpen);

  // Derived state for which panel to show
  // Read directly from navigationState for proper reactivity
  const activeToolPanel = $derived(navigationState.activeTab);

  // Loading states
  const isPersistenceFullyInitialized = $derived(
    createModuleState.isPersistenceInitialized &&
      constructTabState?.isPersistenceInitialized !== false
  );
  const isGeneratePanelActive = $derived(
    isPersistenceFullyInitialized && activeToolPanel === "generate"
  );
  let generateLoadStatus = $state<"idle" | "loading" | "loaded" | "error">(
    "idle"
  );

  const activeSequenceState = $derived.by(() => {
    const state = createModuleState.getActiveTabSequenceState();
    void state.selectedStepNumber;
    return state;
  });

  const isStartPositionSelected = $derived(
    activeSequenceState.selectedStepNumber === 0
  );

  // Properly handle null state - don't convert to false, let it stay null for loading detection
  const shouldShowStartPositionPicker = $derived.by(() => {
    if (!isPersistenceFullyInitialized) return null;
    if (!constructTabState?.isInitialized) return null;

    const pickerState = constructTabState.shouldShowStartPositionPicker();
    // Return null if state is not yet determined (still initializing)
    if (pickerState === null) return null;

    return pickerState || isStartPositionSelected;
  });

  // Loading when either persistence isn't ready OR picker state is null (still determining)
  const isPickerStateLoading = $derived(
    !constructTabState?.isPersistenceInitialized ||
      shouldShowStartPositionPicker === null
  );

  // Convert SequenceData to PictographData[] for OptionViewer
  // Include startingPosition as the first element if it exists
  // IMPORTANT: Use getActiveTabSequenceState() to get tab-specific data
  const currentSequenceData = $derived.by(() => {
    const seq = activeSequenceState.currentSequence;
    if (!seq) return [];

    const startStep = seq.startingPosition || seq.startPosition;
    if (!startStep) return [...seq.steps];

    // Include start position beat as first element, followed by regular steps
    return [startStep, ...seq.steps];
  });

  // Get grid mode from the sequence (source of truth after transforms)
  // Falls back to startPositionState when no sequence exists yet
  const sequenceGridMode = $derived.by(() => {
    const seq = activeSequenceState.currentSequence;
    // Use sequence's grid mode if available (updated by rotations)
    if (seq?.gridMode) return seq.gridMode;
    // Fallback to start position picker's grid mode (for initial selection)
    return (
      constructTabState?.startPositionStateService?.currentGridMode ??
      GridMode.DIAMOND
    );
  });
  const currentStartPosition = $derived(
    activeSequenceState.currentSequence?.startingPosition ??
      activeSequenceState.currentSequence?.startPosition ??
      null
  );
  const isEditingExistingStart = $derived(
    isStartPositionSelected && activeSequenceState.currentSequence !== null
  );

  let pendingStartPosition = $state<{
    path: StartPositionPath;
    previousPosition: PictographData | null;
  } | null>(null);

  // Props (only callbacks and bindable refs)
  let {
    toolPanelRef = $bindable(),
    onOptionSelected,
    onPracticeStepIndexChange,
    onOpenFilters,
    onCloseFilters,
  }: {
    toolPanelRef?: IToolPanelMethods | null;
    onOptionSelected: (option: PictographData) => Promise<void>;
    onPracticeStepIndexChange: (index: number | null) => void;
    onOpenFilters: () => void;
    onCloseFilters: () => void;
  } = $props();

  function handleStartPositionSubmitted(
    position: PictographData,
    path: StartPositionPath
  ): void {
    if (areStartPositionsEquivalent(position, currentStartPosition)) {
      completeTutorialStartPosition(position, path);
      pendingStartPosition = null;
      return;
    }

    pendingStartPosition = {
      path,
      previousPosition: currentStartPosition,
    };
  }

  function completeTutorialStartPosition(
    position: PictographData,
    path: StartPositionPath
  ): void {
    logConstructStartPositionCompleted({
      path,
      gridMode: sequenceGridMode,
    });
    constructTutorialState.recordStartPosition(
      getStartPositionDisplayLabel(position)
    );
  }

  $effect(() => {
    const pending = pendingStartPosition;
    const committedPosition = currentStartPosition;
    if (!pending || !committedPosition) return;
    if (committedPosition === pending.previousPosition) return;

    completeTutorialStartPosition(committedPosition, pending.path);
    pendingStartPosition = null;
  });
</script>

{#snippet generateLoading()}
  <div
    class="generate-load-state"
    role="status"
    aria-atomic="true"
    aria-busy="true"
    out:flyFade={{ y: 0 }}
  >
    <ProgressRing percent={-1} size={32} strokeWidth={3} />
    <p>Loading generator…</p>
  </div>
{/snippet}

{#snippet generateError(_error: unknown, retry: () => void)}
  <div class="generate-load-state generate-load-error" role="alert">
    <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
    <p>The generator couldn’t load.</p>
    <PanelButton variant="secondary" onclick={retry}>
      <i class="fas fa-rotate-right" aria-hidden="true"></i>
      <span>Try again</span>
    </PanelButton>
  </div>
{/snippet}

<div class="tool-panel-wrapper">
  <!-- Keep the loaded module available after first use, but don't compete with
       Construct's first pictographs by loading another tool during startup. -->
  <div
    class="creation-tool-content generate-tool-content"
    class:is-active={isGeneratePanelActive}
    aria-hidden={!isGeneratePanelActive}
    aria-busy={isGeneratePanelActive && generateLoadStatus === "loading"}
    inert={!isGeneratePanelActive || !!panelState.workspacePlayback}
  >
    <div class="sub-tab-content" data-tab="generate">
      <LazyMount
        loader={() => import("../../generate/components/GeneratePanel.svelte")}
        active={isGeneratePanelActive}
        keepAlive={false}
        placeholder={isGeneratePanelActive ? generateLoading : undefined}
        error={generateError}
        debugName="Generate settings panel"
        onStatusChange={(status) => (generateLoadStatus = status)}
        props={{
          sequenceState: createModuleState.getActiveTabSequenceState(),
          isDesktop: isSideBySideLayout(),
        }}
      />
    </div>
  </div>

  {#if !isPersistenceFullyInitialized}
    <!-- Loading state while persistence is being restored -->
    <div class="persistence-loading">
      <ProgressRing percent={-1} size={32} strokeWidth={3} />
      <p>Restoring sequence...</p>
    </div>
  {:else if activeToolPanel && activeToolPanel !== "generate"}
    <!-- Render the appropriate tool panel based on active tab -->
    <div class="creation-tool-content" data-active-tab={activeToolPanel}>
      {#key activeToolPanel}
        <div class="sub-tab-content" data-tab={activeToolPanel}>
          {#if activeToolPanel === "construct"}
            <!-- Constructor Mode - Manual builder (step by step) -->
            {#if isPickerStateLoading}
              <div class="picker-loading">
                <ProgressRing percent={-1} size={32} strokeWidth={3} />
                <p>Loading options...</p>
              </div>
            {:else}
              <ConstructTabContent
                shouldShowStartPositionPicker={shouldShowStartPositionPicker ===
                  true}
                startPositionState={constructTabState.startPositionStateService}
                currentSequence={currentSequenceData}
                currentGridMode={sequenceGridMode}
                initialStartPosition={currentStartPosition}
                lockStartGridMode={isEditingExistingStart}
                startPositionValidationMessage={constructTabState.error}
                {onOptionSelected}
                onStartPositionNavigateToAdvanced={() => {}}
                onStartPositionNavigateToDefault={() => {}}
                {isSideBySideLayout}
                {onOpenFilters}
                {onCloseFilters}
                {isFilterPanelOpen}
                isContinuousOnly={constructTabState.isContinuousOnly}
                onToggleContinuous={(value) =>
                  constructTabState.setContinuousOnly(value)}
                onStartPositionSubmitted={handleStartPositionSubmitted}
              />
            {/if}
          {:else if activeToolPanel === "assemble"}
            <!-- Assemble Mode - Click grid points to build sequences (deferred chunk) -->
            {@const assembleTabState = createModuleState.assembleTabState}
            {#if assembleTabState}
              <LazyMount
                loader={() =>
                  import("../../assemble/components/AssembleToolPanel.svelte")}
                active
                props={{ tabState: assembleTabState }}
              />
            {:else}
              <div class="coming-soon-panel">
                <p>Assemble loading...</p>
              </div>
            {/if}
          {:else if activeToolPanel === "fuse"}
            <!-- Fuse Mode - Combine two sequences into one (deferred chunk) -->
            <LazyMount
              loader={() => import("$lib/features/fuse/FuseTab.svelte")}
              active
            />
          {:else if activeToolPanel === "tunnel"}
            <LazyMount
              loader={() => import("../../tunnel/TunnelTab.svelte")}
              active
            />
          {/if}
        </div>
      {/key}
    </div>
  {:else if !activeToolPanel}
    <!-- Fallback case -->
    <div class="no-tab-selected">
      <p>No tab selected</p>
    </div>
  {/if}
</div>

<style>
  .tool-panel-wrapper {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    overflow: hidden;
    position: relative;
  }

  .creation-tool-content {
    flex: 1;
    min-height: 0;
    position: relative;
    overflow: hidden;
  }

  .generate-tool-content:not(.is-active) {
    display: none;
  }

  .sub-tab-content {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;

    /* Container for child components to query available space */
    /* Use 'size' (not 'inline-size') to enable height queries */
    container-type: size;
    container-name: tool-panel;
  }

  /* Loading states */
  .persistence-loading,
  .picker-loading,
  .coming-soon-panel,
  .no-tab-selected {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    width: 100%;
    gap: 16px;
    color: var(--theme-text-dim);
  }

  .coming-soon-panel p,
  .no-tab-selected p {
    font-size: var(--font-size-sm);
    margin: 0;
  }

  .generate-load-state {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-md, 16px);
    width: 100%;
    height: 100%;
    padding: var(--spacing-lg, 24px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    text-align: center;
  }

  .generate-load-state p {
    margin: 0;
    font-size: var(--font-size-sm, 14px);
    line-height: 1.4;
  }

  .generate-load-error > i {
    color: var(--semantic-error, #ef4444);
    font-size: 1.5rem;
  }
</style>
