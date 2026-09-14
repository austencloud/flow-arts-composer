<!--
  SequenceActionsPanel.svelte

  Panel for sequence-wide operations: transforms, patterns, extend.
  Individual beat editing (turns, rotation) is handled by StepEditorPanel.
-->
<script lang="ts">
  import { getExtensionFlowCoordinator } from "$lib/features/create/shared/get-extension-flow-coordinator";
  import { copyToClipboard } from "$lib/features/create/shared/services/sequence-json-exporter";
  import * as sequenceTransferHandlerModule from "$lib/features/create/shared/services/sequence-transfer-handler";
  import * as subDrawerStatePersisterModule from "$lib/features/create/shared/services/sub-drawer-state-persister";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { ExtensionAnalysis } from "../../services/sequence-extender";
  import type { LOOPType } from "$lib/shared/foundation/domain/models/generation/circular-models";
  import type { Letter } from "$lib/shared/foundation/domain/models/letter";
  import { UndoOperationType } from "../../services/undo-manager";
  import { navigationState } from "$lib/shared/navigation/state/navigation-state.svelte";
  import { BREAKPOINTS } from "$lib/shared/device/domain/constants/device-constants";
  import { getCreateModuleContext } from "../../context/create-module-context";
  import { toast } from "$lib/shared/toast/state/toast-state.svelte";
  import { isAdmin, authState } from "$lib/shared/auth/state/auth-state.svelte";
  import { authDrawerState } from "$lib/shared/auth/state/auth-drawer-state.svelte";
  import type { AuthNudgeTrigger } from "$lib/shared/auth/domain/auth-nudge-trigger";
  import { resolveAccessTier } from "$lib/shared/auth/domain/access-tier";
  import { isPremiumOrAbove } from "$lib/shared/auth/domain/models/user-role";
  import { createSequenceActionsPanelState } from "../../state/sequence-actions-panel-state.svelte";
  import { createSequenceActionsOrchestrator } from "../../services/sequence-actions-orchestrator";
  import { quintOut } from "svelte/easing";
  import { fly } from "svelte/transition";
  import { DURATION } from "$lib/shared/transitions/transitions";

  import CreatePanelDrawer from "../CreatePanelDrawer.svelte";
  import SequencePreviewDialog from "./SequencePreviewDialog.svelte";
  import SequenceTransformActions from "$lib/shared/create/components/SequenceTransformActions.svelte";
  import TransformHelpOverlay from "../transform-help/TransformHelpOverlay.svelte";
  import TransformDetailModal from "../transform-help/TransformDetailModal.svelte";
  import TurnPatternView from "./TurnPatternView.svelte";

  import type { ActionHelpId } from "../../domain/transforms/transform-help-content";
  import DirectionView from "./DirectionView.svelte";
  import type { DirectionDrillRoute } from "./direction-drill-route";
  import DurationPatternView from "./DurationPatternView.svelte";
  import ExtendView from "./ExtendView.svelte";
  import StepGridSection from "./StepGridSection.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import FirstStepConfirmDialog from "./FirstStepConfirmDialog.svelte";
  import HandSelector from "./HandSelector.svelte";
  import MobileHandSelector from "./MobileHandSelector.svelte";
  import MobileActionToolbar from "./MobileActionToolbar.svelte";
  import { getSequenceActionsPanelHeight } from "./sequence-actions-panel-height";
  import { openSequenceViewer } from "$lib/shared/sequence-viewer/services/sequence-viewer-navigator";
  import { getReturnContext } from "$lib/shared/coordinators/sequence-handoff.svelte";

  interface Props {
    show: boolean;
    onClose?: () => void;
    /** Deterministic entry points used by the isolated responsive review route. */
    initialSubView?: "turnPattern" | "duration" | "rotation" | "extend" | null;
    initialDirectionRoute?: DirectionDrillRoute;
    initialRotationMode?: "apply" | "save";
    initialActionCategory?: "transform" | "patterns" | "edit";
    initialExtensionAnalysis?: ExtensionAnalysis | null;
    initialHelpAction?: ActionHelpId | null;
    persistReviewState?: boolean;
  }

  let {
    show,
    onClose,
    initialSubView = null,
    initialDirectionRoute = "hub",
    initialRotationMode = "apply",
    initialActionCategory,
    initialExtensionAnalysis = null,
    initialHelpAction = null,
    persistReviewState = true,
  }: Props = $props();

  // Context and state
  const ctx = getCreateModuleContext();
  const { CreateModuleState, panelState, layout } = ctx;
  // Use $derived.by() to ensure reactive property tracking through function calls
  const activeSequenceState = $derived.by(() =>
    CreateModuleState.getActiveTabSequenceState()
  );
  const sequence = $derived.by(() => activeSequenceState.currentSequence);
  const hasSequence = $derived.by(() => activeSequenceState.hasSequence());
  const isInConstructTab = $derived(
    navigationState.currentCreateMode === "construct"
  );
  const isSideBySideLayout = $derived(layout.shouldUseSideBySideLayout);

  // Track viewport width reactively for compact mode detection
  let viewportWidth = $state(
    typeof window !== "undefined" ? window.innerWidth : 1000
  );
  let viewportHeight = $state(
    typeof window !== "undefined" ? window.innerHeight : 800
  );

  // Swap is disabled when only one hand is selected (swap requires both hands)
  const isSwapDisabled = $derived(panelState.targetHand !== "both");

  $effect(() => {
    if (typeof window === "undefined") return;
    viewportWidth = window.innerWidth; // Update on mount
    viewportHeight = window.innerHeight;
    const handleResize = () => {
      viewportWidth = window.innerWidth;
      viewportHeight = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  });

  const isMobileLayout = $derived(!isSideBySideLayout);

  // Keep the sequence visible above the actions whenever the workspace and
  // controls are stacked. Phone-sized layouts still use the compact toolbar,
  // but the drawer only replaces the controls at the bottom of the screen.
  const useWorkspaceContextLayout = $derived(!isSideBySideLayout);

  // Compact mode for mobile portrait - horizontal icon+text layout
  // Applies to most mobile widths, disabled at tablet/desktop widths
  const useCompactMode = $derived(
    !isSideBySideLayout && viewportWidth < BREAKPOINTS.PORTRAIT_MOBILE
  );

  const basePanelHeight = $derived(
    panelState.navigationBarHeight + panelState.toolPanelHeight
  );

  // Services
  const hapticService = getHapticFeedback();
  const extensionFlowCoordinator = getExtensionFlowCoordinator();
  const subDrawerPersister = subDrawerStatePersisterModule;
  const transferHandler = sequenceTransferHandlerModule;

  const viewState = createSequenceActionsPanelState({
    initialSubView,
    initialDirectionRoute,
    initialExtensionAnalysis,
    initialHelpAction,
  });
  const actionOrchestrator = createSequenceActionsOrchestrator({
    getSequenceState: () => activeSequenceState,
    getTargetHand: () => panelState.targetHand,
    hapticService,
    pushUndoSnapshot: (type) => CreateModuleState.pushUndoSnapshot(type),
    executeTransformAction: (action, options) => {
      const dispatcher = ctx.getSequenceTransformActions();
      return dispatcher
        ? dispatcher.execute(action, options)
        : Promise.resolve({
            status: "unavailable" as const,
            message: "Sequence actions are still loading",
          });
    },
    busyState: viewState,
    extensionFlowCoordinator,
    finishShiftStart: () => {
      panelState.exitShiftStartMode();
      viewState.finishShiftStart();
    },
    copySequenceJson: copyToClipboard,
  });

  // The drawer owns layout and DOM effects. The state owner handles all panel
  // navigation, transient extension data, dialogs, and operation guards.
  let isOpen = $state(false);
  const isTransforming = $derived(viewState.isTransforming);
  const isExtending = $derived(viewState.isExtending);
  const helpMode = $derived(viewState.helpMode);
  const selectedTransform = $derived(viewState.selectedTransform);
  const helpEntry = $derived(viewState.helpEntry);
  const subView = $derived(viewState.subView);
  const directionRoute = $derived(viewState.directionRoute);
  const extensionAnalysis = $derived(viewState.extensionAnalysis);
  const circularizationOptions = $derived(viewState.circularizationOptions);
  const directUnavailableReason = $derived(viewState.directUnavailableReason);
  const pendingSequenceTransfer = $derived(viewState.pendingSequenceTransfer);
  const showShiftConfirmDialog = $derived(viewState.showShiftConfirmDialog);
  const pendingShiftStepNumber = $derived(viewState.pendingShiftStepNumber);

  // The root actions keep the exact workspace-controls footprint. A deeper
  // task earns one more control row, but never at the cost of hiding the
  // sequence that the task is editing.
  const panelHeight = $derived.by(() => {
    return getSequenceActionsPanelHeight({
      basePanelHeight,
      viewportHeight,
      workspaceContext: useWorkspaceContextLayout,
      hasDrilldown: subView !== null,
    });
  });

  const subViewTitle = $derived(viewState.subViewTitle);
  const backLabel = $derived(viewState.backLabel);
  const subViewSubtitle = $derived(viewState.subViewSubtitle);

  // This follows the same one-layer drill motion as SettingsDrillPanel. An
  // outgoing transition would leave the old board interactive underneath the
  // new one, so the old board exits synchronously and only the arriving board
  // moves. That makes push and back exact counterparts.
  let reducedMotion = $state(
    typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  $effect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  });

  const NAV_TRAVEL = 30;
  const navEnterX = $derived(NAV_TRAVEL * viewState.navDirection);
  const navDuration = $derived(reducedMotion ? 0 : DURATION.normal);
  const navigationKey = $derived(
    subView === "rotation"
      ? `${subView}:${directionRoute}`
      : (subView ?? "root")
  );

  // Auto-save active sub-drawer to sessionStorage
  // Only clears if restoration is complete (prevents clearing saved state on mount)
  $effect(() => {
    if (!subDrawerPersister || !persistReviewState) return;

    const activeDrawer = viewState.getPersistedSubDrawer();

    if (activeDrawer) {
      subDrawerPersister.setActiveSubDrawer(activeDrawer);
    } else if (viewState.restorationComplete) {
      // Only clear if restoration is done - prevents clearing on initial mount
      subDrawerPersister.clearSubDrawer();
    }
  });

  // Shift start mode uses panelState for cross-component coordination
  const isShiftStartMode = $derived(panelState.isShiftStartMode);

  // Sync isOpen with show prop, reset restore flag on close
  $effect(() => {
    isOpen = show;
    if (!show) {
      viewState.resetRestorationOnClose();
    }
  });

  // The workspace controls intentionally float above ordinary drawers. In the
  // context-preserving layout they are not relevant, so hide them while the
  // lower actions surface is open and restore them on close or resize.
  const workspaceContextBodyClass = "sequence-actions-workspace-context";
  $effect(() => {
    if (typeof document === "undefined") return;

    if (isOpen && useWorkspaceContextLayout) {
      document.body.classList.add(workspaceContextBodyClass);
    } else {
      document.body.classList.remove(workspaceContextBodyClass);
    }

    return () => document.body.classList.remove(workspaceContextBodyClass);
  });

  // Beat selection state (for displaying in beat grid)
  const selectedStepNumber = $derived.by(
    () => activeSequenceState.selectedStepNumber
  );
  const hasSelection = $derived(selectedStepNumber !== null);

  // Extension availability - check if sequence can be extended
  const canExtend = $derived.by(() => {
    if (!sequence || !extensionFlowCoordinator) return false;
    return extensionFlowCoordinator.canExtend(sequence);
  });

  // Shift start availability - need at least 2 steps
  const canShiftStart = $derived(
    !!(sequence && sequence.steps && sequence.steps.length >= 2)
  );

  // Note: Services are resolved at module scope from ITI container

  // Restore sub-drawer state when panel opens.
  // Opens the sub-drawer immediately so user goes straight to
  // Duration/Extend/Turns/Rotation without seeing the actions grid first.
  $effect(() => {
    if (!persistReviewState) {
      viewState.skipRestoration();
      return;
    }
    if (isOpen && !viewState.hasRestoredSubView && subDrawerPersister) {
      const restoredSubDrawer = subDrawerPersister.getActiveSubDrawer();
      const restoreEffect = viewState.restoreSubView(restoredSubDrawer);
      if (restoreEffect === "enter-duration-preview") {
        // Restore must run the same entry side effects as handleDuration():
        // without an active preview session, DurationPatternView's onPreview
        // no-ops and pattern changes silently don't show on the timeline
        // until the user backs out and re-enters.
        if (isSideBySideLayout && sequence) {
          panelState.enterDurationPreviewMode(sequence);
        }
      } else if (restoreEffect === "start-extend-flow") {
        // Extend is transient and never auto-persisted (see auto-save effect),
        // so a stored "extend" only comes from a direct persisted launch.
        // Recompute the analysis against the CURRENT sequence instead of
        // restoring a stale empty view. handleExtend
        // sets subView="extend" on success, or leaves the actions grid showing
        // (subView stays null) when the sequence isn't extendable.
        void handleExtend();
      }
    }
  });

  const handleMirror = actionOrchestrator.mirror;
  const handleSwap = actionOrchestrator.swap;
  const handleRewind = actionOrchestrator.rewind;
  const handleFlip = actionOrchestrator.flip;
  const handleInvert = actionOrchestrator.invert;
  const handleRotateCW = actionOrchestrator.rotateClockwise;
  const handleRotateCCW = actionOrchestrator.rotateCounterclockwise;

  function handlePreview() {
    if (!sequence) return;
    hapticService?.trigger("selection");
    handleClose();
    const { returnPath, returnLabel } = getReturnContext();
    openSequenceViewer(sequence, {
      source: "create_workspace",
      returnPath,
      returnLabel,
    });
  }

  function handleTurnPattern() {
    hapticService?.trigger("selection");
    viewState.openTurnPatterns();
  }

  /** Back out of an inline sub-view, reverting any per-view side effects. */
  function exitSubView() {
    hapticService?.trigger("selection");
    const effect = viewState.exitSubView();
    if (
      effect === "discard-duration-preview" &&
      panelState.isDurationPreviewMode
    ) {
      panelState.exitDurationPreviewMode(false);
    }
  }

  function handleTurnPatternApply(result: {
    sequence: SequenceData;
    warnings?: readonly string[];
  }) {
    actionOrchestrator.applyPattern(
      UndoOperationType.APPLY_TURN_PATTERN,
      result.sequence
    );
  }

  function handleRotationDirection() {
    hapticService?.trigger("selection");
    viewState.openDirection();
  }

  function handleDirectionRouteChange(route: DirectionDrillRoute) {
    hapticService?.trigger("selection");
    viewState.changeDirectionRoute(route);
  }

  function handleRotationDirectionApply(result: {
    sequence: SequenceData;
    warnings?: readonly string[];
  }) {
    actionOrchestrator.applyPattern(
      UndoOperationType.APPLY_ROTATION_PATTERN,
      result.sequence
    );
  }

  function handleReversalApply(result: {
    sequence: SequenceData;
    warnings?: readonly string[];
  }) {
    actionOrchestrator.applyPattern(
      UndoOperationType.APPLY_ROTATION_PATTERN,
      result.sequence
    );
  }

  function handleDuration() {
    hapticService?.trigger("selection");
    viewState.openDuration();
    if (isSideBySideLayout && sequence) {
      panelState.enterDurationPreviewMode(sequence);
    }
  }

  function handleDurationApply(result: {
    sequence: SequenceData;
    warnings?: readonly string[];
  }) {
    actionOrchestrator.applyPattern(
      UndoOperationType.APPLY_DURATION_PATTERN,
      result.sequence,
      () => {
        if (panelState.isDurationPreviewMode) {
          panelState.exitDurationPreviewMode(true);
        }
      }
    );
    viewState.completeDuration();
  }

  function handleDurationPreview(result: {
    sequence: SequenceData;
    warnings?: readonly string[];
  }) {
    if (panelState.isDurationPreviewMode) {
      panelState.setPreviewSequence(result.sequence);
    }
  }

  async function handleExtend() {
    const result = await actionOrchestrator.startExtension();
    if (result.status === "completed") {
      viewState.openExtend(result.value);
    } else if (result.status === "failed") {
      toast.warning(result.message);
    }
  }

  /**
   * Handle bridge pictograph selection - immediately appends to sequence
   * and re-analyzes to show LOOP options.
   */
  async function handleBridgeAppend(bridgeLetter: Letter) {
    const result = await actionOrchestrator.appendBridge(bridgeLetter);
    if (result.status === "completed") {
      viewState.updateExtensionAfterBridge(result.value.analysis);
      toast.success(result.value.message);
    } else if (result.status === "failed") {
      toast.error(result.message);
    }
  }

  /**
   * Handle LOOP selection - applies the LOOP to extend the sequence.
   * Bridge letter (if any) has already been appended by handleBridgeAppend.
   */
  async function handleExtendApply(loopType: LOOPType) {
    const result = await actionOrchestrator.applyLoop(loopType);
    if (result.status === "completed") {
      toast.success(result.value.message);
      viewState.completeExtension();
    } else if (result.status === "failed") {
      toast.warning(result.message);
    }
  }

  /**
   * Repeat the sequence until the props return to their start orientation.
   * The position already closed; only orientation is still open, so no LOOP
   * transform is involved.
   */
  function handleOrientationRepeat() {
    const result = actionOrchestrator.applyOrientationRepeat();
    if (result.status === "completed") {
      toast.success(result.value.message);
      viewState.completeExtension();
    } else if (result.status === "failed") {
      toast.warning(result.message);
    }
  }

  function handleEditInConstructor() {
    if (!sequence || !transferHandler) return;
    hapticService?.trigger("selection");

    const constructTabState = ctx.constructTabState;
    if (!constructTabState?.sequenceState) return;

    const currentConstructorSequence =
      constructTabState.sequenceState.currentSequence;
    const hasSequence = constructTabState.sequenceState.hasSequence();

    const result = transferHandler.checkTransfer(
      sequence,
      currentConstructorSequence,
      hasSequence
    );

    switch (result.action) {
      case "already-loaded":
        toast.info("Sequence already loaded in Construct");
        handleClose();
        navigationState.setActiveTab("construct");
        break;
      case "confirm-needed":
        viewState.requestTransferConfirmation(result.pendingSequence);
        break;
      case "transfer":
        performSequenceTransfer(result.sequence);
        break;
    }
  }

  async function performSequenceTransfer(sequenceToTransfer: SequenceData) {
    if (!transferHandler) return;
    const constructTabState = ctx.constructTabState;
    if (!constructTabState?.sequenceState) return;

    // Create properly typed object for transfer (TypeScript narrowing doesn't apply to the whole object)
    const transferTarget = {
      sequenceState: constructTabState.sequenceState,
      syncGridModeFromSequence: constructTabState.syncGridModeFromSequence,
      setSelectedStartPosition: constructTabState.setSelectedStartPosition,
      setShowStartPositionPicker: constructTabState.setShowStartPositionPicker,
      syncPickerStateWithSequence:
        constructTabState.syncPickerStateWithSequence,
    };

    await transferHandler.executeTransfer(sequenceToTransfer, transferTarget);

    // Close panel and switch tab AFTER state is saved
    handleClose();
    navigationState.setActiveTab("construct");
  }

  function handleClose() {
    hapticService?.trigger("selection");
    if (isShiftStartMode) cancelShiftStart();
    onClose?.();
  }

  function handleStepSelect(stepNumber: number) {
    hapticService?.trigger("selection");
    activeSequenceState.selectStep(stepNumber);
    // Opening Beat Editor is handled by the auto-open effect
  }

  function handleOpenBeatEditor() {
    hapticService?.trigger("selection");
    panelState.openStepEditorPanel();
  }

  function handleShiftStart() {
    if (!sequence || !canShiftStart) return;
    hapticService?.trigger("selection");
    panelState.enterShiftStartMode(handleShiftStartPoseSelect);
    toast.info("Tap the pose you want to start from.");
  }

  /** `tileIndex` is the tapped pose: 0 for the start tile, 1..n for steps. */
  function handleShiftStartPoseSelect(tileIndex: number) {
    hapticService?.trigger("selection");
    const result = actionOrchestrator.analyzeShiftStart(tileIndex);
    if (!result) return;

    switch (result.action) {
      case "no-op":
        toast.info(result.reason);
        panelState.exitShiftStartMode();
        viewState.finishShiftStart();
        break;
      case "immediate":
        void executeShiftStart(result.targetStepNumber);
        break;
      case "confirm-needed":
        viewState.requestShiftConfirmation(result.targetStepNumber);
        break;
    }
  }

  async function executeShiftStart(targetStepNumber: number) {
    const result = await actionOrchestrator.shiftStart(targetStepNumber);
    if (result.status === "completed") toast.success(result.value.message);
    else if (result.status === "failed") toast.error(result.message);
  }

  function cancelShiftStart() {
    panelState.exitShiftStartMode();
    viewState.finishShiftStart();
  }

  // ===== GUEST GATE: PATTERNS SECTION =====
  // Guests keep Transform and Edit; the Patterns tools are an account perk.
  // A locked tile stays tappable and routes straight to the contextual auth
  // screen (no intermediate nudge — same policy as the LOOP gate, Austen
  // 2026-08-10). Help mode is unaffected: the grid intercepts clicks before
  // these handlers when help is active, so learning stays free.
  const patternsLocked = $derived(
    resolveAccessTier(
      authState.isAuthenticated,
      authState.isAnonymous,
      isPremiumOrAbove(authState.role)
    ) === "guest"
  );

  function gatedPattern(
    action: () => void | Promise<void>,
    trigger: AuthNudgeTrigger = "patterns-guest"
  ): () => void {
    return () => {
      if (patternsLocked) {
        authDrawerState.show("signup", trigger);
        return;
      }
      void action();
    };
  }

  const gatedTurnPattern = gatedPattern(handleTurnPattern);
  const gatedRotationDirection = gatedPattern(handleRotationDirection);
  const gatedDuration = gatedPattern(handleDuration);
  const gatedRewind = gatedPattern(handleRewind);
  // Extend adds steps, so the ask names the step cap rather than the tools.
  const gatedExtend = gatedPattern(handleExtend, "step-cap-guest");
  const gatedShiftStart = gatedPattern(handleShiftStart);

  async function handleCopySequenceJson() {
    const result = await actionOrchestrator.copySequenceJson();
    if (result.status === "completed") {
      toast.success("Sequence JSON copied to clipboard");
    } else if (result.status === "failed") {
      toast.error(result.message);
    }
  }

  // ===== HELP MODE HANDLERS =====
  // Toggle body class for z-index boosting (drawer needs to be above backdrop)
  $effect(() => {
    if (helpMode === "selecting") {
      document.body.classList.add("help-mode-active");
    } else {
      document.body.classList.remove("help-mode-active");
    }
    return () => document.body.classList.remove("help-mode-active");
  });

  function enterHelpMode() {
    hapticService?.trigger("selection");
    viewState.enterHelpMode();
  }

  function selectTransformHelp(actionId: ActionHelpId) {
    hapticService?.trigger("selection");
    viewState.selectTransformHelp(actionId);
  }

  function closeDetailModal() {
    viewState.closeHelpDetail();
  }

  function exitHelpMode() {
    viewState.exitHelpMode();
  }

  /** Mobile long-press help: skip "selecting" mode, go directly to viewing */
  function handleHelpRequest(actionId: ActionHelpId) {
    viewState.openDirectHelp(actionId);
  }
</script>

<CreatePanelDrawer
  bind:isOpen
  panelName="sequence-actions"
  combinedPanelHeight={panelHeight}
  fullHeightOnMobile={!useWorkspaceContextLayout}
  showHandle={true}
  closeOnBackdrop={true}
  focusTrap={false}
  lockScroll={false}
  ariaLabel="Sequence actions panel"
  onClose={handleClose}
>
  <div
    class="editor-panel"
    class:help-active={helpMode === "selecting"}
    class:workspace-context={useWorkspaceContextLayout}
  >
    {#key navigationKey}
      <div
        class="view-layer"
        in:fly|local={{
          x: navEnterX,
          duration: navDuration,
          easing: quintOut,
        }}
      >
        {#if subView}
          <!-- Inline drill-down: sub-view swaps the panel content in place -->
          <div class="compact-header sub">
            <button
              type="button"
              class="icon-btn back"
              onclick={exitSubView}
              aria-label={backLabel}
            >
              <i class="fas fa-chevron-left" aria-hidden="true"></i>
              <span class="button-label">Back</span>
            </button>
            <div class="sub-title">
              <h2 class="panel-title">{subViewTitle}</h2>
              {#if subViewSubtitle}
                <p class="sub-subtitle">{subViewSubtitle}</p>
              {/if}
            </div>
            <div class="header-actions">
              <button
                type="button"
                class="icon-btn close"
                onclick={handleClose}
                aria-label="Close"
              >
                <i class="fas fa-times" aria-hidden="true"></i>
                <span class="button-label">Close</span>
              </button>
            </div>
          </div>
          <div class="sub-view-body">
            {#if subView === "turnPattern"}
              <TurnPatternView {sequence} onApply={handleTurnPatternApply} />
            {:else if subView === "duration"}
              <DurationPatternView
                {sequence}
                onPreview={handleDurationPreview}
                onApply={handleDurationApply}
              />
            {:else if subView === "rotation"}
              <DirectionView
                {sequence}
                targetHand={panelState.targetHand}
                route={directionRoute}
                {initialRotationMode}
                onRouteChange={handleDirectionRouteChange}
                onReversalApply={handleReversalApply}
                onRotationApply={handleRotationDirectionApply}
              />
            {:else if subView === "extend"}
              <ExtendView
                analysis={extensionAnalysis}
                {circularizationOptions}
                {directUnavailableReason}
                isApplying={isExtending}
                onBridgeAppend={handleBridgeAppend}
                onApply={handleExtendApply}
                onOrientationRepeat={handleOrientationRepeat}
              />
            {/if}
          </div>
        {:else}
          <!-- Simple header with title and actions -->
          <div class="compact-header" class:dimmed={helpMode === "selecting"}>
            <div class="header-lead">
              <button
                type="button"
                class="icon-btn back"
                onclick={handleClose}
                aria-label="Back to workspace"
              >
                <i class="fas fa-chevron-left" aria-hidden="true"></i>
                <span class="button-label">Back</span>
              </button>
              <h2 class="panel-title">Sequence Actions</h2>
            </div>

            {#if isMobileLayout}
              <!-- Mobile: inline segmented hand selector in header -->
              <MobileHandSelector
                value={panelState.targetHand}
                onChange={(hand) => panelState.setTargetHand(hand)}
              />
            {/if}

            <div class="header-actions">
              {#if isAdmin() && hasSequence}
                <button
                  type="button"
                  class="icon-btn copy"
                  onclick={handleCopySequenceJson}
                  aria-label="Copy JSON for this sequence"
                  title="Copy JSON for this sequence"
                >
                  <i class="fas fa-code" aria-hidden="true"></i>
                  <span class="button-label">Copy JSON</span>
                </button>
              {/if}
              {#if !isMobileLayout}
                <button
                  type="button"
                  class="icon-btn help"
                  class:active={helpMode === "selecting"}
                  onclick={enterHelpMode}
                  aria-label="Help with transform actions"
                >
                  <i class="fas fa-circle-question" aria-hidden="true"></i>
                  <span class="button-label">Help</span>
                </button>
              {/if}
              <button
                type="button"
                class="icon-btn close"
                onclick={handleClose}
                aria-label="Close"
              >
                <i class="fas fa-times" aria-hidden="true"></i>
                <span class="button-label">Close</span>
              </button>
            </div>
          </div>

          <!-- Hand selector for single-hand transforms (desktop only) -->
          {#if !isMobileLayout}
            <div class:dimmed={helpMode === "selecting"}>
              <HandSelector
                value={panelState.targetHand}
                onChange={(hand) => panelState.setTargetHand(hand)}
              />
            </div>
          {/if}

          <!-- Beat grid display: shows on mobile, takes all available space -->
          {#if hasSequence && isSideBySideLayout === false && sequence && !useWorkspaceContextLayout}
            <div
              class="step-grid-wrapper"
              class:dimmed={helpMode === "selecting"}
            >
              <StepGridSection
                steps={sequence.steps}
                startPosition={sequence.startPosition ||
                  sequence.startingPosition ||
                  null}
                {selectedStepNumber}
                isShiftMode={isShiftStartMode}
                mobileMode={isMobileLayout}
                onStepClick={isShiftStartMode
                  ? handleShiftStartPoseSelect
                  : handleStepSelect}
                onStartClick={() =>
                  isShiftStartMode
                    ? handleShiftStartPoseSelect(0)
                    : handleStepSelect(0)}
                onStepLongPress={handlePreview}
                onCancelShiftMode={cancelShiftStart}
              />
            </div>
          {/if}

          {#if isMobileLayout}
            <!-- Mobile: compact toolbar with category tabs -->
            <MobileActionToolbar
              {hasSequence}
              fillAvailableHeight={useWorkspaceContextLayout}
              {hasSelection}
              {isTransforming}
              {canExtend}
              {isExtending}
              {canShiftStart}
              shiftStartActive={isShiftStartMode}
              initialCategory={initialActionCategory}
              persistCategory={persistReviewState}
              swapDisabled={isSwapDisabled}
              showEditInConstructor={!isInConstructTab}
              onHelpRequest={handleHelpRequest}
              onTurns={handleOpenBeatEditor}
              onMirror={handleMirror}
              onFlip={handleFlip}
              onInvert={handleInvert}
              onRotateCW={handleRotateCW}
              onRotateCCW={handleRotateCCW}
              onSwap={handleSwap}
              onRewind={gatedRewind}
              onTurnPattern={gatedTurnPattern}
              onRotationDirection={gatedRotationDirection}
              onDuration={gatedDuration}
              onExtend={gatedExtend}
              onShiftStart={isShiftStartMode
                ? cancelShiftStart
                : gatedShiftStart}
              onEditInConstructor={handleEditInConstructor}
              {patternsLocked}
            />
          {:else}
            <!-- Desktop: full grid of all actions -->
            <div class="controls-content">
              <SequenceTransformActions
                {hasSequence}
                {hasSelection}
                {isTransforming}
                {canExtend}
                {isExtending}
                {canShiftStart}
                swapDisabled={isSwapDisabled}
                showEditInConstructor={!isInConstructTab}
                isDesktopPanel={isSideBySideLayout}
                compactMode={useCompactMode}
                helpMode={helpMode === "selecting"}
                onHelpSelect={selectTransformHelp}
                onTurns={handleOpenBeatEditor}
                onMirror={handleMirror}
                onFlip={handleFlip}
                onInvert={handleInvert}
                onRotateCW={handleRotateCW}
                onRotateCCW={handleRotateCCW}
                onSwap={handleSwap}
                onRewind={gatedRewind}
                onTurnPattern={gatedTurnPattern}
                onRotationDirection={gatedRotationDirection}
                onDuration={gatedDuration}
                onExtend={gatedExtend}
                onShiftStart={gatedShiftStart}
                onEditInConstructor={handleEditInConstructor}
                {patternsLocked}
              />
            </div>
          {/if}
        {/if}
      </div>
    {/key}
  </div>
</CreatePanelDrawer>

<!-- Help mode: overlay when selecting, modal when viewing -->
{#if helpMode === "selecting"}
  <TransformHelpOverlay onClose={exitHelpMode} />
{:else if helpMode === "viewing" && selectedTransform}
  <TransformDetailModal
    transformId={selectedTransform}
    onClose={closeDetailModal}
    presentation={helpEntry === "direct" && isMobileLayout ? "drawer" : "modal"}
  />
{/if}

<SequencePreviewDialog
  bind:isOpen={viewState.showConfirmDialog}
  currentSequence={ctx.constructTabState?.sequenceState?.currentSequence}
  incomingSequence={pendingSequenceTransfer}
  onConfirm={() => {
    if (pendingSequenceTransfer) {
      void performSequenceTransfer(pendingSequenceTransfer);
    }
    viewState.clearTransferConfirmation();
  }}
  onCancel={viewState.clearTransferConfirmation}
/>

<!-- Choose Start confirmation (non-loop sequences drop the steps before the pose) -->
<FirstStepConfirmDialog
  show={showShiftConfirmDialog && pendingShiftStepNumber !== null}
  stepsToRemove={(pendingShiftStepNumber ?? 1) - 1}
  onConfirm={() => executeShiftStart(pendingShiftStepNumber!)}
  onCancel={cancelShiftStart}
/>

<!-- Spotlight Modal - Replaced with /sequence/[id] route navigation -->

<style>
  :global(.drawer-content.sequence-actions-panel-container) {
    /* The controls need a matte reading surface over the live pictograph
       workspace. Keep the active theme color, then resolve it against the
       solid sheet base so petals and glyphs cannot show through. */
    --sheet-bg:
      linear-gradient(var(--theme-panel-bg), var(--theme-panel-bg)),
      var(--sheet-bg-solid, rgb(15, 15, 20));
    --sheet-filter: none;
  }

  .editor-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    position: relative;
    container: sequence-actions-panel / inline-size;
  }

  :global(body.sequence-actions-workspace-context .button-panel-wrapper),
  :global(body.sequence-actions-workspace-context .workspace-history-actions) {
    visibility: hidden;
    opacity: 0;
    pointer-events: none;
  }

  /* The keyed navigation layer always fills the same box, so the arriving
     board can move without changing the panel's layout. */
  .view-layer {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
    will-change: transform, opacity;
  }

  /* Compact header */
  .compact-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    box-sizing: border-box;
    padding: 4px 12px;
    /* The drawer already owns the surface. A second translucent fill made the
       header read as a separate blue-gray strip instead of its top edge. */
    background: transparent;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    border-bottom: 1px solid var(--theme-stroke);
    height: calc(var(--min-touch-target, 44px) + 8px);
    flex-shrink: 0;
    /* The header doubles as the drag region (swipe-to-dismiss attaches to the
       whole panel); the decorative edge handle is hidden on desktop below. */
    cursor: grab;
  }

  .compact-header:active {
    cursor: grabbing;
  }

  .panel-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--theme-text);
    white-space: nowrap;
  }

  /* Back chevron + title grouped at the left of the root header. */
  .header-lead {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  /* Drill-down sub-view header: back-left, title-centered, close-right */
  .compact-header.sub {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    height: calc(var(--min-touch-target, 44px) + 8px);
    min-height: calc(var(--min-touch-target, 44px) + 8px);
    padding-block: 4px;
  }

  .sub-title {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-width: 0;
  }

  .compact-header.sub .panel-title {
    text-align: center;
  }

  .sub-subtitle {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.2;
    color: var(--theme-text-dim);
    text-align: center;
  }

  .icon-btn.back {
    background: var(--theme-card-bg);
    color: var(--theme-text-dim);
  }

  .icon-btn.back:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.12));
    color: var(--theme-text);
  }

  /* Bare flex container — each inline view owns its own scroll + padding. */
  .sub-view-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    container: sequence-action-subview / size;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: auto;
    min-width: var(--min-touch-target);
    height: var(--min-touch-target);
    gap: 7px;
    padding-inline: 12px;
    border-radius: 999px;
    cursor: pointer;
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 14px);
    font-weight: 650;
    transition: all var(--duration-fast) ease;
    border: 1px solid var(--theme-stroke-strong);
    background: var(--theme-card-bg);
  }

  .icon-btn i {
    width: 1rem;
    font-size: var(--font-size-min, 14px);
    text-align: center;
  }

  .button-label {
    font-size: var(--font-size-min, 14px);
    font-weight: 650;
    line-height: 1;
    white-space: nowrap;
  }

  .icon-btn.copy {
    background: color-mix(
      in srgb,
      var(--semantic-info, #3b82f6) 14%,
      transparent
    );
    color: var(--semantic-info-text, #93c5fd);
    border-color: color-mix(
      in srgb,
      var(--semantic-info, #3b82f6) 36%,
      transparent
    );
  }

  .icon-btn.copy:hover {
    background: rgba(59, 130, 246, 0.25);
    color: rgba(59, 130, 246, 1);
    border-color: rgba(59, 130, 246, 0.5);
  }

  .icon-btn.help {
    background: var(--theme-card-bg);
    color: var(--theme-text-dim);
  }

  .icon-btn.help:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.12));
    color: var(--theme-text);
  }

  .icon-btn.help.active {
    background: rgba(59, 130, 246, 0.2);
    color: rgba(59, 130, 246, 1);
    border-color: rgba(59, 130, 246, 0.5);
    animation: help-pulse 1.5s ease-in-out infinite;
  }

  @keyframes help-pulse {
    0%,
    100% {
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
    }
    50% {
      box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.4);
    }
  }

  .icon-btn.close {
    background: var(--theme-card-bg);
    color: var(--theme-text-dim);
  }

  .icon-btn.close:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.12));
    color: var(--theme-text);
    border-color: var(--theme-stroke-strong);
  }

  /* A short landscape workspace leaves roughly 25rem for the drawer. Keep all
     actions legible there and let the dialog's accessible name carry the title. */
  @container sequence-actions-panel (max-width: 34rem) {
    .compact-header:not(.sub) .panel-title {
      display: none;
    }

    .compact-header:not(.sub) .header-lead {
      gap: 0;
    }
  }

  /* At the phone floor, Back is the single exit from the root. The duplicate
     Close and admin-only copy action yield to the title and hand selector. */
  @container sequence-actions-panel (max-width: 25rem) {
    .compact-header {
      padding: 4px 10px;
    }

    .compact-header:not(.sub) .icon-btn.copy,
    .compact-header:not(.sub) .icon-btn.close {
      display: none;
    }

    .compact-header:not(.sub) .panel-title {
      display: block;
    }

    .icon-btn {
      width: auto;
      min-width: var(--min-touch-target);
      height: var(--min-touch-target);
      padding-inline: 10px;
    }

    .compact-header:not(.sub) .header-lead {
      gap: 8px;
    }
  }

  /* Note: Beat grid visibility is controlled by isSideBySideLayout in the template,
     not by CSS media queries. The JavaScript logic considers device type,
     orientation, and viewport dimensions for proper responsive behavior. */

  /* Wrapper lets step grid absorb all remaining vertical space */
  .step-grid-wrapper {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .controls-content {
    flex: 1;
    min-height: 180px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    /* Query container for the action grid's proportional sizing (Approach A
       in SequenceTransformActions). cqh inside resolves against this box's height,
       which flex:1 makes definite — so button/icon/label scale to the panel,
       not to their own content. */
    container-type: size;
  }

  @media (prefers-reduced-motion: reduce) {
    .icon-btn {
      transition: none;
    }
  }

  /* Help mode dimming for non-interactive sections */
  .dimmed {
    opacity: 0.3;
    pointer-events: none;
    transition: opacity var(--duration-normal) ease;
  }

  /* Boost drawer z-index when help mode is active (above backdrop at 200) */
  :global(body.help-mode-active .sequence-actions-panel-container) {
    z-index: 210 !important;
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    .active {
      animation: none;
    }
  }
</style>
