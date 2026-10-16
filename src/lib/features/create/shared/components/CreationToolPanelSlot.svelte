<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import ProgressRing from "#lib/shared/components/loading/ProgressRing.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { Crossfade, flyFade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  /**
   * Creation Tool Panel Slot
   *
   * Renders the appropriate tool panel based on the active tab.
   * Each creation mode (Constructor, Generator, Assemble) has its own dedicated panel.
   *
   * Domain: Create module - Tool panel presentation
   */

  import { navigationState } from "#lib/shared/navigation/state/navigation-state.svelte.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import type {
    IToolPanelMethods,
    OptionSelectedHandler,
  } from "../types/create-module-types";
  import { getCreateModuleContext } from "../context/create-module-context";
  import LazyMount from "#lib/shared/components/LazyMount.svelte";
  import ConstructTabContent from "./ConstructTabContent.svelte";
  import SaveToLibraryView from "./SaveToLibraryView.svelte";
  import { sequenceGridJoin } from "#lib/shared/grid-join/sequence-grid-join.js";
  import { getSequenceOverlayState } from "#lib/shared/sequence-viewer/state/sequence-viewer-overlay-state.svelte.js";
  import {
    isStepEditorViewShown,
    STEP_EDITOR_TABS,
  } from "../services/step-editor-availability";
  // GeneratePanel (136-file subtree), AssembleToolPanel (21), FuseTab (235!)
  // and ShapeEngineTab are deferred via LazyMount — only the active build-mode
  // tab's chunk loads. Construct is the default tab so ConstructTabContent
  // stays eager. This keeps ~400 files out of the Create module's first-paint
  // graph (see scripts/trace-create-three.cjs).
  import {
    logConstructStartPlacementCompleted,
    type StartPlacementPath,
  } from "../../construct/services/construct-analytics";
  import { getStartPlacementDisplayLabel } from "../../construct/start-placement-picker/services/start-placement-display-label";
  import { areStartPlacementsEquivalent } from "../../construct/start-placement-picker/services/start-placement-equivalence";

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
  // Save mode: the tools step aside for the save view while the live grid in
  // the workspace stays as the preview. The generator keeps its mounted panel
  // (its settings and queued results survive) but fades out and goes inert.
  const isSaveView = $derived(
    isPersistenceFullyInitialized && panelState.isSaveToLibraryPanelOpen
  );
  let generateLoadStatus = $state<"idle" | "loading" | "loaded" | "error">(
    "idle"
  );

  const activeSequenceState = $derived.by(() => {
    const state = createModuleState.getActiveTabSequenceState();
    void state.selectedStepNumber;
    return state;
  });

  const sequenceOverlay = getSequenceOverlayState();
  // The step editor takes the same place while a step or mandala is selected.
  // Save outranks it: the save view leaves only once saving is done or
  // cancelled.
  const wantsStepEditorView = $derived(
    isPersistenceFullyInitialized &&
      !isSaveView &&
      isStepEditorViewShown({
        isPanelOpen: panelState.isStepEditorPanelOpen,
        activeTab: activeToolPanel,
        sequence: activeSequenceState.currentSequence,
        selectedStepNumber: activeSequenceState.selectedStepNumber,
        selectedStepNumbers: activeSequenceState.selectedStepNumbers,
        hasMandalaSelection: panelState.mandalaViewerSelection !== null,
        isSequenceViewerOpen: sequenceOverlay.isOpen,
      })
  );

  // The editor is its own chunk. Opening it before the chunk arrived faded the
  // stage into an empty layer and then popped the whole editor in. So the
  // chunk warms while the browser is idle, and if a step is picked before it
  // lands, the picker stays put until it does; the swap then fades into a
  // finished editor. A failed load still switches over, so LazyMount can show
  // its error state.
  const loadStepEditor = () =>
    import("./coordinators/StepEditorCoordinator.svelte");
  let stepEditorLoaded = $state(false);
  let stepEditorLoad: Promise<void> | null = null;
  function warmStepEditor(): void {
    stepEditorLoad ??= loadStepEditor().then(
      () => {
        stepEditorLoaded = true;
      },
      () => {
        stepEditorLoaded = true;
      }
    );
  }
  $effect(() => {
    if (wantsStepEditorView) warmStepEditor();
  });
  $effect(() => {
    if (!isPersistenceFullyInitialized || stepEditorLoad) return;
    if (typeof requestIdleCallback === "undefined") {
      const handle = setTimeout(warmStepEditor, 1000);
      return () => clearTimeout(handle);
    }
    const handle = requestIdleCallback(warmStepEditor, { timeout: 4000 });
    return () => cancelIdleCallback(handle);
  });
  const isStepEditorView = $derived(wantsStepEditorView && stepEditorLoaded);

  const isOverlayView = $derived(isSaveView || isStepEditorView);
  const toolStageKey = $derived(
    isSaveView ? "save" : isStepEditorView ? "step-editor" : "tools"
  );
  const showGeneratePanel = $derived(
    isGeneratePanelActive && !isSaveView && !isStepEditorView
  );
  // The sequence viewer survives Create HMR independently from the editor.
  // If both states restore, the viewer owns the screen and clears the editor.
  $effect(() => {
    if (sequenceOverlay.isOpen && panelState.isStepEditorPanelOpen) {
      panelState.closeStepEditorPanel();
    }
  });

  // Re-open the editor when a multi-selection becomes active. Covers the
  // HMR/refresh restore path: the persisted multi set comes back but
  // selectedStepNumber is null in multi mode, so the single-step auto-open
  // effect doesn't fire. Only opens on the false→true transition (never
  // auto-closes) so it doesn't fight a manual close.
  const isMultiSelect = $derived(
    activeSequenceState.isMultiSelectMode &&
      activeSequenceState.selectedStepNumbers.size > 1
  );
  let lastIsMulti = false;
  $effect(() => {
    const multi = isMultiSelect;
    if (
      multi &&
      !lastIsMulti &&
      STEP_EDITOR_TABS.has(activeToolPanel) &&
      !sequenceOverlay.isOpen
    ) {
      panelState.openStepEditorPanel();
    }
    lastIsMulti = multi;
  });

  const isStartPlacementSelected = $derived(
    activeSequenceState.selectedStepNumber === 0
  );

  // Properly handle null state - don't convert to false, let it stay null for loading detection
  const shouldShowStartPlacementPicker = $derived.by(() => {
    if (!isPersistenceFullyInitialized) return null;
    if (!constructTabState?.isInitialized) return null;

    const pickerState = constructTabState.shouldShowStartPlacementPicker();
    // Return null if state is not yet determined (still initializing)
    if (pickerState === null) return null;

    return pickerState || isStartPlacementSelected;
  });

  // Loading when either persistence isn't ready OR picker state is null (still determining)
  const isPickerStateLoading = $derived(
    !constructTabState?.isPersistenceInitialized ||
      shouldShowStartPlacementPicker === null
  );

  // Convert SequenceData to PictographData[] for OptionViewer
  // Include startingPlacement as the first element if it exists
  // IMPORTANT: Use getActiveTabSequenceState() to get tab-specific data
  const currentSequenceData = $derived.by(() => {
    const seq = activeSequenceState.currentSequence;
    if (!seq) return [];

    const startStep = seq.startingPlacement || seq.startPlacement;
    if (!startStep) return [...seq.steps];

    // Include start placement beat as first element, followed by regular steps
    return [startStep, ...seq.steps];
  });

  // Get grid mode from the sequence (source of truth after transforms)
  // Falls back to startPlacementState when no sequence exists yet
  const sequenceGridMode = $derived.by(() => {
    const seq = activeSequenceState.currentSequence;
    // Use sequence's grid mode if available (updated by rotations)
    if (seq?.gridMode) return seq.gridMode;
    // Fallback to start placement picker's grid mode (for initial selection)
    return (
      constructTabState?.startPlacementStateService?.currentGridMode ??
      GridMode.DIAMOND
    );
  });
  // The join is part of the sequence, so the pickers draw their tiles on it too.
  const sequenceJoin = $derived(
    sequenceGridJoin(activeSequenceState.currentSequence)
  );
  const currentStartPlacement = $derived(
    activeSequenceState.currentSequence?.startingPlacement ??
      activeSequenceState.currentSequence?.startPlacement ??
      null
  );
  const isEditingExistingStart = $derived(
    isStartPlacementSelected && activeSequenceState.currentSequence !== null
  );

  let pendingStartPlacement = $state<{
    path: StartPlacementPath;
    previousPlacement: PictographData | null;
  } | null>(null);

  // Props (only callbacks and bindable refs)
  let {
    toolPanelRef = $bindable(),
    currentDisplayWord = "",
    onOptionSelected,
    onPracticeStepIndexChange,
    onOpenFilters,
    onCloseFilters,
  }: {
    toolPanelRef?: IToolPanelMethods | null;
    /** The workspace word, named in the save view. */
    currentDisplayWord?: string;
    onOptionSelected: OptionSelectedHandler;
    onPracticeStepIndexChange: (index: number | null) => void;
    onOpenFilters: () => void;
    onCloseFilters: () => void;
  } = $props();

  function handleStartPlacementSubmitted(
    placement: PictographData,
    path: StartPlacementPath
  ): void {
    if (areStartPlacementsEquivalent(placement, currentStartPlacement)) {
      completeTutorialStartPlacement(placement, path);
      pendingStartPlacement = null;
      return;
    }

    pendingStartPlacement = {
      path,
      previousPlacement: currentStartPlacement,
    };
  }

  function completeTutorialStartPlacement(
    placement: PictographData,
    path: StartPlacementPath
  ): void {
    logConstructStartPlacementCompleted({
      path,
      gridMode: sequenceGridMode,
    });
    constructTutorialState.recordStartPlacement(
      getStartPlacementDisplayLabel(placement)
    );
  }

  $effect(() => {
    const pending = pendingStartPlacement;
    const committedPlacement = currentStartPlacement;
    if (!pending || !committedPlacement) return;
    if (committedPlacement === pending.previousPlacement) return;

    completeTutorialStartPlacement(committedPlacement, pending.path);
    pendingStartPlacement = null;
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
    <p>{t("create_audit_generator_loading")}</p>
  </div>
{/snippet}

{#snippet generateError(_error: unknown, retry: () => void)}
  <div class="generate-load-state generate-load-error" role="alert">
    <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
    <p>{t("create_audit_generator_load_error")}</p>
    <PanelButton variant="secondary" onclick={retry}>
      <i class="fas fa-rotate-right" aria-hidden="true"></i>
      <span>{t("create_ui_try_again")}</span>
    </PanelButton>
  </div>
{/snippet}

<div class="tool-panel-wrapper">
  <!-- Keep the loaded module available after first use, but don't compete with
       Construct's first pictographs by loading another tool during startup. -->
  <div
    class="creation-tool-content generate-tool-content"
    class:is-active={isGeneratePanelActive}
    class:save-mode={isOverlayView}
    aria-hidden={!showGeneratePanel}
    aria-busy={showGeneratePanel && generateLoadStatus === "loading"}
    inert={!showGeneratePanel}
  >
    <div class="sub-tab-content" data-tab="generate">
      <LazyMount
        loader={() => import("../../generate/components/GeneratePanel.svelte")}
        active={isGeneratePanelActive}
        keepAlive={false}
        placeholder={isGeneratePanelActive ? generateLoading : undefined}
        error={generateError}
        debugName={t("create_audit_generator_panel")}
        onStatusChange={(status) => (generateLoadStatus = status)}
        props={{
          sequenceState: createModuleState.getActiveTabSequenceState(),
          isDesktop: isSideBySideLayout(),
        }}
      />
    </div>
  </div>

  <!-- The tools stay mounted under the save view and the step editor, hidden
       like the generator, so the option picker is already drawn and laid out
       when it comes back instead of building its pictographs mid fade. -->
  <div
    class="tool-stage tools-layer"
    class:is-idle={showGeneratePanel}
    class:covered={isOverlayView}
    aria-hidden={isOverlayView}
    inert={isOverlayView}
  >
    {#if !isPersistenceFullyInitialized}
      <!-- Loading state while persistence is being restored -->
      <div class="persistence-loading">
        <ProgressRing percent={-1} size={32} strokeWidth={3} />
        <p>{t("create_ui_restoring_sequence")}</p>
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
                  <p>{t("create_ui_loading_options")}</p>
                </div>
              {:else}
                <ConstructTabContent
                  shouldShowStartPlacementPicker={shouldShowStartPlacementPicker ===
                    true}
                  startPlacementState={constructTabState.startPlacementStateService}
                  currentSequence={currentSequenceData}
                  currentGridMode={sequenceGridMode}
                  gridJoin={sequenceJoin}
                  initialStartPlacement={currentStartPlacement}
                  lockStartGridMode={isEditingExistingStart}
                  startPlacementValidationMessage={constructTabState.error}
                  {onOptionSelected}
                  onStartPlacementNavigateToAdvanced={() => {}}
                  onStartPlacementNavigateToDefault={() => {}}
                  {isSideBySideLayout}
                  {onOpenFilters}
                  {onCloseFilters}
                  {isFilterPanelOpen}
                  isContinuousOnly={constructTabState.isContinuousOnly}
                  onToggleContinuous={(value) =>
                    constructTabState.setContinuousOnly(value)}
                  onStartPlacementSubmitted={handleStartPlacementSubmitted}
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
                  <p>{t("create_ui_assemble_loading")}</p>
                </div>
              {/if}
            {:else if activeToolPanel === "fuse"}
              <!-- Fuse Mode - Combine two sequences into one (deferred chunk) -->
              <LazyMount
                loader={() => import("#lib/features/fuse/FuseTab.svelte")}
                active
              />
            {:else if activeToolPanel === "tunnel"}
              <LazyMount
                loader={() => import("../../tunnel/TunnelTab.svelte")}
                active
              />
            {:else if activeToolPanel === "shape-engine"}
              <!-- Shape - pick a shape pairing, get the sequence (deferred chunk) -->
              <LazyMount
                loader={() =>
                  import("../../shape-engine/ShapeEngineTab.svelte")}
                active
              />
            {/if}
          </div>
        {/key}
      </div>
    {:else if !activeToolPanel}
      <!-- Fallback case -->
      <div class="no-tab-selected">
        <p>{t("create_ui_no_tab_selected")}</p>
      </div>
    {/if}
  </div>

  <!-- The save view and the step editor trade places with the tools like the
       start placement picker and the option picker do: the leaving one fades
       out, then the arriving one fades in, both pinned to the same box. -->
  <div class="tool-stage" class:is-idle={!isOverlayView}>
    <Crossfade key={toolStageKey} duration={DURATION.normal} mode="swap" fill>
      {#if isSaveView}
        <div class="creation-tool-content" data-active-tab="save">
          <div class="sub-tab-content" data-tab="save">
            <SaveToLibraryView
              word={currentDisplayWord}
              onClose={() => panelState.closeSaveToLibraryPanel()}
            />
          </div>
        </div>
      {:else if isStepEditorView}
        <div class="creation-tool-content" data-active-tab="step-editor">
          <div class="sub-tab-content" data-tab="step-editor">
            <LazyMount loader={loadStepEditor} active />
          </div>
        </div>
      {/if}
    </Crossfade>
  </div>
</div>

<style>
  /* One cell: the generator's kept-alive panel and the stage for the other
     tools (or the save view) stack in it, so the save view can fade in over a
     fading generator without either reflowing the other. */
  .tool-panel-wrapper {
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    grid-template-columns: minmax(0, 1fr);
    height: 100%;
    width: 100%;
    overflow: hidden;
    position: relative;
  }

  .tool-panel-wrapper > .generate-tool-content,
  .tool-stage {
    grid-area: 1 / 1;
    min-width: 0;
    min-height: 0;
  }

  .tool-stage {
    position: relative;
    overflow: hidden;
  }

  /* While the generator is the active tool, the stage holds only an empty
     crossfade layer stacked above it. That layer must not take the clicks
     meant for the generator's cards. */
  .tool-stage.is-idle {
    pointer-events: none;
  }

  .creation-tool-content {
    height: 100%;
    min-height: 0;
    position: relative;
    overflow: hidden;
  }

  .generate-tool-content:not(.is-active) {
    display: none;
  }

  /* Save view or step editor: the tool underneath fades out and stops taking
     input but stays mounted with its state and drawn pictographs. Coming
     back, it waits for the leaving view to finish fading, the same swap the
     crossfade above uses, so the two never show through each other. */
  .generate-tool-content,
  .tools-layer {
    transition:
      opacity var(--duration-normal) var(--ease-standard) var(--duration-normal),
      visibility 0s linear var(--duration-normal);
  }

  .generate-tool-content.save-mode,
  .tools-layer.covered {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition:
      opacity var(--duration-normal) var(--ease-standard),
      visibility 0s linear var(--duration-normal);
  }

  @media (prefers-reduced-motion: reduce) {
    .generate-tool-content,
    .generate-tool-content.save-mode,
    .tools-layer,
    .tools-layer.covered {
      transition: none;
    }
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
