import type { ActionHelpId } from "../domain/transforms/transform-help-content";
import {
  getDirectionDrillDepth,
  getDirectionDrillParent,
  getDirectionDrillSubtitle,
  getDirectionDrillTitle,
  type DirectionDrillRoute,
} from "../components/sequence-actions/direction-drill-route";
import { getHelpModeAfterDetailClose } from "../components/sequence-actions/sequence-actions-help-flow";
import type { SequenceActionsHelpEntry } from "../components/sequence-actions/sequence-actions-help-flow";
import type {
  CircularizationOption,
  ExtensionAnalysis,
  ExtensionFlowStart,
} from "../services/sequence-extender";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { SubDrawerType } from "../services/sub-drawer-state-persister";

export type SequenceActionsSubView =
  | "turnPattern"
  | "duration"
  | "rotation"
  | "extend"
  | null;

export type SequenceActionsHelpMode = "inactive" | "selecting" | "viewing";
export type SequenceActionsRestoreEffect =
  | "none"
  | "enter-duration-preview"
  | "start-extend-flow";
export type SequenceActionsExitEffect = "none" | "discard-duration-preview";

export interface SequenceActionsPanelStateOptions {
  initialSubView?: SequenceActionsSubView;
  initialDirectionRoute?: DirectionDrillRoute;
  initialExtensionAnalysis?: ExtensionAnalysis | null;
  initialHelpAction?: ActionHelpId | null;
}

export function createSequenceActionsPanelState(
  options: SequenceActionsPanelStateOptions = {}
) {
  const {
    initialSubView = null,
    initialDirectionRoute = "hub",
    initialExtensionAnalysis = null,
    initialHelpAction = null,
  } = options;

  let subView = $state<SequenceActionsSubView>(initialSubView);
  let directionRoute = $state<DirectionDrillRoute>(initialDirectionRoute);
  let navDirection = $state<1 | -1>(1);
  let extensionAnalysis = $state<ExtensionAnalysis | null>(
    initialExtensionAnalysis
  );
  let circularizationOptions = $state<CircularizationOption[]>([]);
  let directUnavailableReason = $state<string | null>(null);

  let helpMode = $state<SequenceActionsHelpMode>(
    initialHelpAction ? "viewing" : "inactive"
  );
  let selectedTransform = $state<ActionHelpId | null>(initialHelpAction);
  let helpEntry = $state<SequenceActionsHelpEntry>(
    initialHelpAction ? "direct" : "selector"
  );

  let isTransforming = $state(false);
  let isExtending = $state(false);
  let showConfirmDialog = $state(false);
  let pendingSequenceTransfer = $state<SequenceData | null>(null);
  let showShiftConfirmDialog = $state(false);
  let pendingShiftStepNumber = $state<number | null>(null);
  let restorationComplete = $state(false);
  let hasRestoredSubView = $state(false);

  function clearExtension(): void {
    extensionAnalysis = null;
    circularizationOptions = [];
    directUnavailableReason = null;
  }

  function openTurnPatterns(): void {
    navDirection = 1;
    subView = "turnPattern";
  }

  function openDirection(): void {
    navDirection = 1;
    directionRoute = "hub";
    subView = "rotation";
  }

  function changeDirectionRoute(route: DirectionDrillRoute): void {
    navDirection =
      getDirectionDrillDepth(route) < getDirectionDrillDepth(directionRoute)
        ? -1
        : 1;
    directionRoute = route;
  }

  function openDuration(): void {
    navDirection = 1;
    subView = "duration";
  }

  function openExtend(result: ExtensionFlowStart): void {
    extensionAnalysis = result.analysis;
    circularizationOptions = result.circularizationOptions;
    directUnavailableReason = result.directUnavailableReason;
    navDirection = 1;
    subView = "extend";
  }

  function updateExtensionAfterBridge(
    analysis: ExtensionAnalysis | null
  ): void {
    extensionAnalysis = analysis;
    circularizationOptions = [];
    directUnavailableReason = null;
  }

  function completeExtension(): void {
    navDirection = -1;
    subView = null;
    clearExtension();
  }

  function completeDuration(): void {
    navDirection = -1;
    subView = null;
  }

  function exitSubView(): SequenceActionsExitEffect {
    navDirection = -1;
    if (subView === "rotation") {
      const parentRoute = getDirectionDrillParent(directionRoute);
      if (parentRoute) {
        directionRoute = parentRoute;
        return "none";
      }
    }

    const effect = subView === "duration" ? "discard-duration-preview" : "none";
    if (subView === "extend") clearExtension();
    subView = null;
    return effect;
  }

  function getPersistedSubDrawer(): SubDrawerType {
    if (subView === "turnPattern") return "turnPattern";
    if (subView === "rotation") return "rotationDirection";
    if (subView === "duration") return "duration";
    if (helpMode !== "inactive") return "help";
    return null;
  }

  function restoreSubView(
    restored: SubDrawerType
  ): SequenceActionsRestoreEffect {
    hasRestoredSubView = true;
    restorationComplete = true;

    if (restored === "help") helpMode = "selecting";
    else if (restored === "turnPattern") subView = "turnPattern";
    else if (restored === "rotationDirection") subView = "rotation";
    else if (restored === "duration") {
      subView = "duration";
      return "enter-duration-preview";
    } else if (restored === "extend") {
      subView = null;
      clearExtension();
      return "start-extend-flow";
    }

    return "none";
  }

  function skipRestoration(): void {
    restorationComplete = true;
    hasRestoredSubView = true;
  }

  function resetRestorationOnClose(): void {
    hasRestoredSubView = false;
    if (subView === "extend") {
      subView = null;
      clearExtension();
    }
  }

  function beginTransform(): boolean {
    if (isTransforming) return false;
    isTransforming = true;
    return true;
  }

  function finishTransform(): void {
    isTransforming = false;
  }

  function beginExtension(): boolean {
    if (isExtending) return false;
    isExtending = true;
    return true;
  }

  function finishExtension(): void {
    isExtending = false;
  }

  function requestTransferConfirmation(sequence: SequenceData): void {
    pendingSequenceTransfer = sequence;
    showConfirmDialog = true;
  }

  function clearTransferConfirmation(): void {
    pendingSequenceTransfer = null;
    showConfirmDialog = false;
  }

  function requestShiftConfirmation(stepNumber: number): void {
    pendingShiftStepNumber = stepNumber;
    showShiftConfirmDialog = true;
  }

  function finishShiftStart(): void {
    pendingShiftStepNumber = null;
    showShiftConfirmDialog = false;
  }

  function enterHelpMode(): void {
    helpEntry = "selector";
    helpMode = "selecting";
  }

  function selectTransformHelp(actionId: ActionHelpId): void {
    helpEntry = "selector";
    selectedTransform = actionId;
    helpMode = "viewing";
  }

  function openDirectHelp(actionId: ActionHelpId): void {
    helpEntry = "direct";
    selectedTransform = actionId;
    helpMode = "viewing";
  }

  function closeHelpDetail(): void {
    helpMode = getHelpModeAfterDetailClose(helpEntry);
    selectedTransform = null;
  }

  function exitHelpMode(): void {
    helpMode = "inactive";
    selectedTransform = null;
    helpEntry = "selector";
  }

  return {
    get subView() {
      return subView;
    },
    get directionRoute() {
      return directionRoute;
    },
    get navDirection() {
      return navDirection;
    },
    get extensionAnalysis() {
      return extensionAnalysis;
    },
    get circularizationOptions() {
      return circularizationOptions;
    },
    get directUnavailableReason() {
      return directUnavailableReason;
    },
    get helpMode() {
      return helpMode;
    },
    get selectedTransform() {
      return selectedTransform;
    },
    get helpEntry() {
      return helpEntry;
    },
    get isTransforming() {
      return isTransforming;
    },
    get isExtending() {
      return isExtending;
    },
    get showConfirmDialog() {
      return showConfirmDialog;
    },
    set showConfirmDialog(value: boolean) {
      showConfirmDialog = value;
    },
    get pendingSequenceTransfer() {
      return pendingSequenceTransfer;
    },
    get showShiftConfirmDialog() {
      return showShiftConfirmDialog;
    },
    get pendingShiftStepNumber() {
      return pendingShiftStepNumber;
    },
    get restorationComplete() {
      return restorationComplete;
    },
    get hasRestoredSubView() {
      return hasRestoredSubView;
    },
    get extendDirectlyLoopable() {
      return (
        (extensionAnalysis?.availableLOOPOptions ?? []).length > 0 ||
        extensionAnalysis?.orientationRepeat != null
      );
    },
    get subViewTitle() {
      if (subView === "turnPattern") return "Turn Patterns";
      if (subView === "duration") return "Duration Patterns";
      if (subView === "rotation") return getDirectionDrillTitle(directionRoute);
      if (subView === "extend")
        return this.extendDirectlyLoopable ? "Extend" : "Choose Bridge";
      return "";
    },
    get backLabel() {
      if (subView !== "rotation") return "Back to sequence actions";
      const parentRoute = getDirectionDrillParent(directionRoute);
      return parentRoute
        ? `Back to ${getDirectionDrillTitle(parentRoute)}`
        : "Back to sequence actions";
    },
    get subViewSubtitle() {
      if (subView === "rotation")
        return getDirectionDrillSubtitle(directionRoute);
      if (subView !== "extend") return "";
      if (!this.extendDirectlyLoopable)
        return "Select a pictograph to reach a loopable placement";
      if (extensionAnalysis?.extensionType === "half_rotation")
        return "180° rotation patterns";
      if (extensionAnalysis?.extensionType === "quarter_rotation")
        return "90° rotation patterns";
      if (extensionAnalysis?.extensionType === "already_complete")
        return "Extend with pattern";
      return "Extend your sequence";
    },
    openTurnPatterns,
    openDirection,
    changeDirectionRoute,
    openDuration,
    openExtend,
    updateExtensionAfterBridge,
    completeExtension,
    completeDuration,
    exitSubView,
    getPersistedSubDrawer,
    restoreSubView,
    skipRestoration,
    resetRestorationOnClose,
    beginTransform,
    finishTransform,
    beginExtension,
    finishExtension,
    requestTransferConfirmation,
    clearTransferConfirmation,
    requestShiftConfirmation,
    finishShiftStart,
    enterHelpMode,
    selectTransformHelp,
    openDirectHelp,
    closeHelpDetail,
    exitHelpMode,
  };
}

export type SequenceActionsPanelState = ReturnType<
  typeof createSequenceActionsPanelState
>;
